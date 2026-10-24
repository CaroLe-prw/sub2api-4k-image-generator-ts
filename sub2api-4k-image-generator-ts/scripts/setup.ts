import { existsSync, readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";

import { applyConfig, isInteractive, saveUserConfig, userConfigPath } from "./config.js";
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

function readLine(question: string, mask: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
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

    stdin.on("data", onData);
  });
}

/** Injectable prompt so the interactive path can be tested without a TTY. */
export type PromptFn = (question: string, mask: boolean) => Promise<string>;

export interface SetupRuntime {
  interactive: boolean;
  prompt: PromptFn;
}

function defaultRuntime(): SetupRuntime {
  return { interactive: isInteractive(), prompt: readLine };
}

/**
 * Collect credentials from flags/env, or prompt for them when running in a TTY,
 * then persist to the user-level config so `skills add --copy` cannot wipe them.
 */
export async function runSetup(
  options: Options,
  flags: SetupFlags = { baseUrlProvided: false, apiKeyProvided: false },
  runtime: SetupRuntime = defaultRuntime(),
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
      "缺少凭据。交互式终端请运行 `--setup` 按提示输入；非交互环境请使用 " +
        "`--setup --base-url https://your-sub2api.example.com --api-key sk-...`。",
    );
  }

  const credentials: Credentials = {
    baseUrl: validateBaseUrl(baseUrl),
    apiKey: validateApiKey(apiKey),
  };

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
