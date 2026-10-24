import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs } from "./args.js";
import { buildRequest, run } from "./cli.js";
import { userConfigPath } from "./config.js";
import { maskApiKey } from "./env.js";
import { runSetup } from "./setup.js";
import { buildImagesPayload, buildResponsesPayload } from "./payload.js";
import { emptyImageResponse, parseSSEText, SSEImageParser } from "./sse.js";
import { iterB64Images, iterPartialB64Images, responseSummary } from "./save.js";

test("parseArgs defaults to 4K images streaming", () => {
  const options = parseArgs(["draw a sword immortal"]);
  assert.equal(options.prompt, "draw a sword immortal");
  assert.equal(options.endpoint, "images");
  assert.equal(options.size, "3840x2160");
  assert.equal(options.quality, "high");
  assert.equal(options.stream, true);
  assert.equal(options.partialImages, 1);
});

test("buildImagesPayload includes stream and partial image controls", () => {
  const options = parseArgs(["draw a cat", "--size", "2160x3840", "--partial-images", "2"]);
  const payload = buildImagesPayload(options);
  assert.equal(payload.model, "gpt-image-2");
  assert.equal(payload.size, "2160x3840");
  assert.equal(payload.stream, true);
  assert.equal(payload.partial_images, 2);
  assert.equal(payload.response_format, "b64_json");
});

test("buildResponsesPayload includes image_generation tool and input image", () => {
  const options = parseArgs([
    "edit this",
    "--endpoint",
    "responses",
    "--input-image",
    "https://example.com/input.png",
  ]);
  const payload = buildResponsesPayload(options);
  assert.equal(payload.model, "gpt-5.4-mini");
  assert.deepEqual(payload.tool_choice, { type: "image_generation" });
  const tools = payload.tools as Array<Record<string, unknown>>;
  assert.equal(tools[0].type, "image_generation");
  const input = payload.input as Array<{ content: Array<Record<string, string>> }>;
  assert.equal(input[0].content[1].type, "input_image");
  assert.equal(input[0].content[1].image_url, "https://example.com/input.png");
});

test("buildRequest selects images or responses URL", () => {
  const imageReq = buildRequest(parseArgs(["x", "--base-url", "https://your-sub2api.example.com/"]));
  assert.equal(imageReq.url, "https://your-sub2api.example.com/v1/images/generations");

  const responsesReq = buildRequest(parseArgs(["x", "--endpoint", "responses", "--base-url", "https://your-sub2api.example.com/"]));
  assert.equal(responsesReq.url, "https://your-sub2api.example.com/v1/responses");
});

test("parseSSEText extracts final images API event", () => {
  const b64 = Buffer.from("final image").toString("base64");
  const response = parseSSEText(
    `event: image_generation.completed\n` +
      `data: {"type":"image_generation.completed","b64_json":"${b64}"}\n\n` +
      `data: [DONE]\n\n`,
  );
  assert.deepEqual([...iterB64Images(response)], [b64]);
});

test("parseSSEText extracts responses output item event", () => {
  const b64 = Buffer.from("responses image").toString("base64");
  const response = parseSSEText(
    `data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"${b64}"}}\n\n`,
  );
  assert.deepEqual([...iterB64Images(response)], [b64]);
});

test("SSEImageParser preserves events across chunks", () => {
  const b64 = Buffer.from("partial").toString("base64");
  const response = emptyImageResponse();
  const parser = new SSEImageParser(response);
  parser.processLine("event: image_generation.partial_image");
  parser.processLine(`data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"${b64}"}`);
  parser.processLine("");
  assert.deepEqual([...iterPartialB64Images(response)], [b64]);
});

test("responseSummary reports final and partial counts", () => {
  const finalB64 = Buffer.from("final").toString("base64");
  const partialB64 = Buffer.from("partial").toString("base64");
  const summary = responseSummary({
    data: [{ b64_json: finalB64 }],
    partial_data: [{ b64_json: partialB64 }],
    output: [],
    _stream_incomplete: true,
    _stream_error: "closed",
  });
  assert.equal(summary.final_images, 1);
  assert.equal(summary.partial_images, 1);
  assert.equal(summary.stream_incomplete, true);
  assert.equal(summary.stream_error, "closed");
});

test("maskApiKey hides full secret", () => {
  assert.equal(maskApiKey("sk-1234567890abcdef"), "sk-123...cdef");
  assert.equal(maskApiKey("short"), "***");
});

test("user config path respects XDG_CONFIG_HOME and stays outside the skill", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-config-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previous;
    }
  });
  assert.equal(userConfigPath(), join(dir, "sub2api-4k-image-generator", "config.env"));
});

test("setup saves credentials with owner-only permissions and no override of existing env", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-setup-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  const previousKey = process.env.SUB2API_API_KEY;
  const previousUrl = process.env.SUB2API_BASE_URL;
  process.env.XDG_CONFIG_HOME = dir;
  delete process.env.SUB2API_API_KEY;
  delete process.env.SUB2API_BASE_URL;
  t.after(() => {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    if (previousKey === undefined) delete process.env.SUB2API_API_KEY;
    else process.env.SUB2API_API_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.SUB2API_BASE_URL;
    else process.env.SUB2API_BASE_URL = previousUrl;
  });

  assert.equal(
    await run(["--setup", "--base-url", "https://sub2api.example.com/v1/", "--api-key", "sk-setup-123456789"]),
    0,
  );

  const path = join(dir, "sub2api-4k-image-generator", "config.env");
  const saved = readFileSync(path, "utf8");
  assert.match(saved, /^SUB2API_BASE_URL=https:\/\/sub2api\.example\.com\/v1$/m);
  assert.match(saved, /^SUB2API_API_KEY=sk-setup-123456789$/m);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(process.env.SUB2API_API_KEY, "sk-setup-123456789");
});

test("setup rejects malformed values before writing config", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-setup-bad-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  t.after(() => {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
  });

  await assert.rejects(
    () => run(["--setup", "--base-url", "ftp://example.com", "--api-key", "sk-x"]),
    /无效的 SUB2API_BASE_URL/,
  );
  await assert.rejects(
    () => run(["--setup", "--base-url", "https://example.com", "--api-key", "   "]),
    /不能为空/,
  );
  assert.equal(existsSync(join(dir, "sub2api-4k-image-generator", "config.env")), false);
});

test("interactive setup prompts for both values and saves them", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-setup-tty-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const previousXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  t.after(() => {
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
  });

  const asked: string[] = [];
  const result = await runSetup(
    parseArgs([]),
    { baseUrlProvided: false, apiKeyProvided: false },
    {
      interactive: true,
      prompt: async (question, mask) => {
        asked.push(`${mask ? "secret" : "text"}:${question.trim()}`);
        return mask ? "sk-interactive-987654321" : "https://tty.example.com";
      },
    },
  );

  assert.equal(asked.length, 2);
  assert.match(asked[0], /^text:SUB2API_BASE_URL/);
  assert.match(asked[1], /^secret:SUB2API_API_KEY/);
  assert.equal(result.credentials.baseUrl, "https://tty.example.com");
  const saved = readFileSync(join(dir, "sub2api-4k-image-generator", "config.env"), "utf8");
  assert.match(saved, /^SUB2API_API_KEY=sk-interactive-987654321$/m);
});

test("missing credentials fail fast in a non-interactive shell", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-nocreds-"));
  const skillDir = process.cwd();
  t.after(() => {
    process.chdir(skillDir);
    rmSync(dir, { recursive: true, force: true });
  });
  const previous = process.env.SUB2API_API_KEY;
  process.env.SUB2API_API_KEY = "";
  t.after(() => {
    if (previous === undefined) delete process.env.SUB2API_API_KEY;
    else process.env.SUB2API_API_KEY = previous;
  });
  process.chdir(dir);
  await assert.rejects(() => run(["draw a cat"]), /Missing API key/);
});


test("input image selects direct edits with the image model and normalized base URL", () => {
  for (const endpoint of [[], ["--endpoint", "images"], ["--endpoint", "edits"]]) {
    const req = buildRequest(parseArgs([
      "add a puppy", ...endpoint, "--base-url", "https://example.com/proxy/v1/",
      "--input-image", "https://example.com/cat.png",
    ]));
    assert.equal(req.url, "https://example.com/proxy/v1/images/edits");
    assert.equal(req.payload.model, "gpt-image-2");
    assert.deepEqual(req.payload.images, [{ image_url: "https://example.com/cat.png" }]);
    assert.equal(req.payload.stream, true);
    assert.equal(req.payload.size, "3840x2160");
    assert.equal(req.payload.tools, undefined);
  }
});

test("explicit edits requires an input image before making a request", () => {
  assert.throws(() => buildRequest(parseArgs(["edit", "--endpoint", "edits"])), /input-image is required/);
});

test("explicit Responses editing retains the selected text model", () => {
  const req = buildRequest(parseArgs([
    "edit", "--endpoint", "responses", "--responses-model", "supported-text-model",
    "--base-url", "https://example.com/v1", "--input-image", "data:image/png;base64,Y2F0",
  ]));
  assert.equal(req.url, "https://example.com/v1/responses");
  assert.equal(req.payload.model, "supported-text-model");
  assert.equal(req.payload.images, undefined);
  assert.equal((req.payload.input as any[])[0].content[1].image_url, "data:image/png;base64,Y2F0");
});

test("edit SSE handles partial and final events with type or event-name fallback", () => {
  for (const includeType of [true, false]) {
    const frame = (type: string, b64: string) => `event: ${type}\r\ndata: ${JSON.stringify({
      ...(includeType ? { type } : {}), b64_json: b64, partial_image_index: 0,
    })}\r\n\r\n`;
    const response = parseSSEText(frame("image_edit.partial_image", "cHJldmlldw==") + frame("image_edit.completed", "ZmluYWw="));
    assert.deepEqual([...iterPartialB64Images(response)], ["cHJldmlldw=="]);
    assert.deepEqual([...iterB64Images(response)], ["ZmluYWw="]);
  }
});

test("CLI editing uploads source bytes and saves final bytes from fragmented SSE", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-edit-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = Buffer.from("source image fixture");
  const final = Buffer.from("edited image fixture");
  const input = join(dir, "source.png");
  writeFileSync(input, source);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls += 1;
    assert.equal(url, "https://example.com/v1/images/edits");
    const body = JSON.parse(init.body as string);
    assert.equal(body.images[0].image_url, `data:image/png;base64,${source.toString("base64")}`);
    assert.equal(body.model, "gpt-image-2");
    const raw = `: keepalive\n\nevent: image_edit.partial_image\ndata: {"b64_json":"cHJldmlldw=="}\n\n` +
      `event: image_edit.completed\ndata: ${JSON.stringify({type: "image_edit.completed", b64_json: final.toString("base64")})}\n\ndata: [DONE]\n\n`;
    const bytes = new TextEncoder().encode(raw);
    return new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    }}), { headers: { "Content-Type": "text/event-stream" } });
  });
  assert.equal(await run(["add a puppy", "--input-image", input, "--base-url", "https://example.com/v1",
    "--api-key", "test-key", "--output-dir", dir, "--prefix", "edited"]), 0);
  assert.equal(calls, 1);
  assert.deepEqual(readFileSync(join(dir, "edited-01.png")), final);
  assert.deepEqual(readFileSync(input), source);
});

test("partial-only editing saves diagnostics and returns failure without a final or retry", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sub2api-edit-partial-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response('event: image_edit.partial_image\ndata: {"b64_json":"cHJldmlldw=="}\n\n',
      { headers: { "Content-Type": "text/event-stream" } });
  });
  assert.equal(await run(["edit", "--input-image", "data:image/png;base64,Y2F0", "--api-key", "test-key",
    "--base-url", "https://example.com", "--output-dir", dir, "--prefix", "partial"]), 1);
  assert.equal(calls, 1);
  assert.deepEqual(readdirSync(dir), ["partial-partial-01.png"]);
  assert.equal(readFileSync(join(dir, "partial-partial-01.png"), "utf8"), "preview");
});
