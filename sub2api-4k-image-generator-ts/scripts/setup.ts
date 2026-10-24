import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { platform, stdout } from "node:process";
import { ReadStream } from "node:tty";

import { applyConfig, saveUserConfig, userConfigPath } from "./config.js";
import { UsageError } from "./errors.js";
import type { Options } from "./types.js";

export interface Credentials {
  baseUrl: string;
  apiKey: string;
}

export interface SetupFlags {
  baseUrlProvided: boolean;
  apiKeyProvided: boolean;
}

export function validateBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(value)) {
    throw new UsageError(`无效的 SUB2API_BASE_URL：${raw}（必须以 http:// 或 https:// 开头）`);
  }
  return value;
}

export function validateApiKey(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new UsageError("SUB2API_API_KEY 不能为空");
  }
  return value;
}

/** Keys are long, whitespace-free tokens; short values are almost always typos. */
export function looksLikeApiKey(raw: string): boolean {
  const value = raw.trim();
  return value.length >= 16 && !/\s/.test(value);
}

function readLine(question: string, mask: boolean, stream: ReadStream): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stream.setRawMode(true);
    stream.resume();
    stream.setEncoding("utf8");
    let value = "";

    const cleanup = () => {
      stream.setRawMode(false);
      stream.pause();
      stream.off("data", onData);
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new UsageError("已取消配置"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (char < " " || char === "\u001b") {
          continue;
        }
        value += char;
        stdout.write(mask ? "*" : char);
      }
    };

    stream.on("data", onData);
  });
}

/** Injectable prompt so the interactive path can be tested without a TTY. */
export type PromptFn = (question: string, mask: boolean) => Promise<string>;

export interface Terminal {
  stream: ReadStream;
  close(): void;
}

/**
 * Prefer the real stdin when it is a TTY. When the CLI is launched from a pipe
 * (`curl ... | bash`), fall back to the controlling terminal so the prompt still works.
 */
export function openTerminal(): Terminal | null {
  if (process.stdin.isTTY) {
    return { stream: process.stdin, close: () => {} };
  }
  const candidates = platform === "win32" ? ["CONIN$"] : ["/dev/tty"];
  for (const path of candidates) {
    let fd: number | undefined;
    try {
      fd = openSync(path, "r");
      const stream = new ReadStream(fd);
      const close = () => {
        try {
          stream.destroy();
        } catch {}
        try {
          closeSync(fd as number);
        } catch {}
      };
      return { stream, close };
    } catch {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {}
      }
    }
  }
  return null;
}

export interface SetupRuntime {
  interactive: boolean;
  prompt: PromptFn;
  dispose?: () => void;
}

/** Open a terminal-backed runtime; the caller owns disposal. */
export function createRuntime(): SetupRuntime {
  const terminal = openTerminal();
  if (!terminal) {
    return {
      interactive: false,
      prompt: () => Promise.reject(new UsageError("当前没有可用的终端，无法交互式输入")),
    };
  }
  return {
    interactive: true,
    prompt: (question, mask) => readLine(question, mask, terminal.stream),
    dispose: terminal.close,
  };
}

export function hasTerminal(): boolean {
  const terminal = openTerminal();
  if (!terminal) {
    return false;
  }
  terminal.close();
  return true;
}

/**
 * Collect credentials from flags/env, or prompt for them when running in a TTY,
 * then persist to the user-level config so `skills add --copy` cannot wipe them.
 */
export async function runSetup(
  options: Options,
  flags: SetupFlags = { baseUrlProvided: false, apiKeyProvided: false },
  runtime: SetupRuntime = createRuntime(),
): Promise<{ credentials: Credentials; path: string }> {
  try {
    return await collectAndSave(options, flags, runtime);
  } finally {
    runtime.dispose?.();
  }
}

async function collectAndSave(
  options: Options,
  flags: SetupFlags,
  runtime: SetupRuntime,
): Promise<{ credentials: Credentials; path: string }> {
  let baseUrl = flags.baseUrlProvided ? options.baseUrl.trim() : "";
  let apiKey = flags.apiKeyProvided ? options.apiKey.trim() : "";

  if (runtime.interactive && (!baseUrl || !apiKey)) {
    stdout.write("\n配置 sub2api 凭据（保存到用户目录，重装 skill 不会丢失）\n\n");
    if (!baseUrl) {
      const fallback = options.baseUrl.trim() && options.baseUrl !== "http://127.0.0.1:8080"
        ? options.baseUrl.trim()
        : "";
      const hint = fallback ? ` [${fallback}]` : "";
      baseUrl = (await runtime.prompt(`SUB2API_BASE_URL${hint}: `, false)) || fallback;
    }
    if (!apiKey) {
      apiKey = await runtime.prompt("SUB2API_API_KEY（输入不回显）: ", true);
    }
  }

  if (flags.baseUrlProvided && !baseUrl) {
    throw new UsageError("SUB2API_BASE_URL 不能为空");
  }
  if (flags.apiKeyProvided && !apiKey) {
    throw new UsageError("SUB2API_API_KEY 不能为空");
  }
  if (!baseUrl || !apiKey) {
    throw new UsageError(
      runtime.interactive
        ? "缺少凭据。请按提示输入，或使用 `--setup --base-url https://your-sub2api.example.com --api-key sk-...`。"
        : "当前没有可用的交互终端，无法提示输入。请使用 " +
            "`--setup --base-url https://your-sub2api.example.com --api-key sk-...`，" +
            "或先导出 SUB2API_BASE_URL / SUB2API_API_KEY。",
    );
  }

  const credentials: Credentials = {
    baseUrl: validateBaseUrl(baseUrl),
    apiKey: validateApiKey(apiKey),
  };

  if (!looksLikeApiKey(credentials.apiKey)) {
    const message =
      `警告：这个值只有 ${credentials.apiKey.length} 个字符，看起来不像 API key（通常是 sk- 开头的长字符串）。`;
    if (runtime.interactive) {
      stdout.write(`${message}\n`);
      const answer = await runtime.prompt("仍然保存？[y/N]: ", false);
      if (!/^y(es)?$/i.test(answer.trim())) {
        throw new UsageError("已取消保存。请重新运行 --setup 输入完整的 API key。");
      }
    } else {
      process.stderr.write(`${message} 仍会保存（非交互模式）。\n`);
    }
  }

  const values: Record<string, string> = {
    SUB2API_BASE_URL: credentials.baseUrl,
    SUB2API_API_KEY: credentials.apiKey,
  };
  const userAgent = options.userAgent.trim();
  if (userAgent && !/^Mozilla\//.test(userAgent)) {
    values.SUB2API_USER_AGENT = userAgent;
  }

  const path = saveUserConfig(values);
  applyConfig(values);
  return { credentials, path };
}

export function describeSavedSetup(result: { credentials: Credentials; path: string }): string {
  let message =
    `已保存凭据到 ${result.path}\n` +
    `  SUB2API_BASE_URL=${result.credentials.baseUrl}\n` +
    `  SUB2API_API_KEY=${result.credentials.apiKey.slice(0, 6)}...（已隐藏）`;
  if (projectEnvShadowsConfig()) {
    message += "\n\n注意：当前目录的 .env 也会提供凭据，且优先级高于用户配置。若要以上面的设置为准，请删除或改名该 .env。";
  }
  return message;
}

/** True when a project `.env` in the current directory also defines credentials. */
export function projectEnvShadowsConfig(path = ".env"): boolean {
  if (!existsSync(path)) {
    return false;
  }
  return /^\s*SUB2API_(BASE_URL|API_KEY)\s*=/m.test(readFileSync(path, "utf8"));
}

export { userConfigPath };
