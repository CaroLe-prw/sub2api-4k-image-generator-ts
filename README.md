<p align="right">
  <a href="README.en.md"><img alt="English README" src="https://img.shields.io/badge/English-README-blue"></a>
</p>

# sub2api 4K Image Generator TS Skill

[![skills.sh](https://skills.sh/b/CaroLe-prw/sub2api-4k-image-generator-ts)](https://skills.sh/CaroLe-prw/sub2api-4k-image-generator-ts)

这是一个 Codex 可用的 agent skill，同时也是一个 TypeScript CLI，用来通过 sub2api 的 OpenAI-compatible endpoint 生成、流式接收、保存和调试高分辨率 AI 图片。

当你需要基于本地 `SUB2API_BASE_URL` / `SUB2API_API_KEY` 调用 `/v1/images/generations` 或 `/v1/responses` 时可以使用它，尤其适合 `3840x2160`、`2160x3840` 这类 4K 输出、streaming partial-image 诊断，以及 Cloudflare 524 timeout 排查。

## 安装

只安装当前 skill 到 Codex：

```bash
npx skills add CaroLe-prw/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts -a codex
```

正确安装后，skill 目录里应该包含 `SKILL.md`、`dist/`、`scripts/` 和 `package.json`。如果你只看到 `SKILL.md`，说明安装到了旧的 root-level layout，请使用下面的更新命令刷新。

安装到所有检测到的 agent：

```bash
npx skills add CaroLe-prw/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts
```

只查看仓库中可被检测到的 skill，不安装：

```bash
npx skills add CaroLe-prw/sub2api-4k-image-generator-ts --list
```

不安装，直接生成使用该 skill 的 prompt：

```bash
npx skills use CaroLe-prw/sub2api-4k-image-generator-ts@sub2api-4k-image-generator-ts
```

## 更新

推荐刷新 Codex 安装：

```bash
npx skills add CaroLe-prw/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts -a codex -y --copy
```

刷新所有检测到的 agent：

```bash
npx skills add CaroLe-prw/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts --all --copy
```

为什么这里使用 `skills add` 而不是 `skills update`：

`npx skills update sub2api-4k-image-generator-ts -p -y` 可能会出现 `Failed to check for deleted skills` 或 `Failed to update`。遇到这种情况时，使用上面的 `skills add ... -y --copy` 命令覆盖刷新到仓库最新版本。

## 使用

安装后的示例提示词：

```text
使用 $sub2api-4k-image-generator-ts 通过我的 sub2api endpoint 生成一张 4K 横图，并返回最终保存的图片路径。
```

这个 skill 会：

- 检查本地 `.env` 或 process environment 中的 `SUB2API_BASE_URL` 和 `SUB2API_API_KEY`
- 为 `3840x2160` 或 `2160x3840` 生成明确的 4K payload
- 默认使用 streaming request，降低慢速 4K 任务遇到 Cloudflare 524 的概率
- 从 SSE event 中捕获 final image 和 partial diagnostic image
- 支持 `/v1/images/generations` 和 `/v1/responses`
- 返回保存的图片路径和诊断信息，同时不会打印完整 API key

## CLI 设置

在运行 CLI 的目录创建或更新 `.env`：

```env
SUB2API_BASE_URL=https://your-sub2api.example.com
SUB2API_API_KEY=sk-...
```

把 `https://your-sub2api.example.com` 替换成你自己的 sub2api 部署域名。也可以在命令里用 `--base-url https://your-sub2api.example.com` 覆盖。

开发时安装依赖：

```powershell
cd .\sub2api-4k-image-generator-ts
npm install
```

## CLI 运行

优先使用已编译的 JavaScript：

```powershell
node .\dist\openai_4k_image_generator.js `
  "cinematic xianxia sword immortal, sea of clouds, glowing sword, no text, no watermark" `
  --size 3840x2160 `
  --quality high `
  --output-dir output
```

也可以直接运行 TypeScript source：

```powershell
npx tsx .\scripts\openai_4k_image_generator.ts `
  "cinematic xianxia sword immortal, sea of clouds, glowing sword, no text, no watermark" `
  --size 3840x2160 `
  --quality high `
  --output-dir output
```

Dry run：

```powershell
npm run dry-run
```

## Python 请求脚本

仓库还包含一个独立的 Python 请求脚本：

```powershell
python .\openai_4k_image_request.py `
  "cinematic xianxia sword immortal, sea of clouds, glowing sword, no text, no watermark" `
  --size 3840x2160 `
  --quality high `
  --output-dir output
```

这个脚本适合在不想进入 Node/TypeScript 工具链时，直接发起 sub2api/OpenAI-compatible 图片生成请求。它会读取 `.env` 中的 `SUB2API_BASE_URL`、`SUB2API_API_KEY` 和 `SUB2API_USER_AGENT`，默认使用 `gpt-image-2`、`3840x2160`、`stream=true` 和 `partial_images=1`。

Python 脚本支持：

- `/v1/images/generations`：默认 endpoint
- `/v1/responses`：通过 `--endpoint responses` 启用
- `--input-image ./input.png`：在 Responses API 中附带本地图片、URL 或 data URL
- streaming SSE：解析 final image 和 partial image event
- `--dry-run`：只打印 URL 和 JSON body，不发送请求

首次使用前安装 Python 依赖：

```powershell
pip install python-dotenv
```

Dry run 示例：

```powershell
python .\openai_4k_image_request.py "test prompt" --dry-run
```

## CLI 选项

- `--size 3840x2160`：横向 4K
- `--size 2160x3840`：纵向 4K
- `--endpoint images`：使用 `/v1/images/generations`
- `--endpoint responses`：使用 `/v1/responses`
- `--input-image ./input.png`：配合 `--endpoint responses` 使用 input image
- `--no-stream`：调试 non-streaming 行为
- `--dry-run`：只打印 URL 和 JSON body，不发送请求

## 仓库结构

```text
.
├── README.md
├── README.en.md
├── LICENSE
└── sub2api-4k-image-generator-ts/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── openai_4k_image_request.py
    ├── scripts/
    │   ├── openai_4k_image_generator.ts # thin executable entrypoint
    │   ├── cli.ts                       # command orchestration
    │   ├── args.ts                      # CLI parsing and defaults
    │   ├── env.ts                       # .env loading and key masking
    │   ├── payload.ts                   # /images and /responses payload builders
    │   ├── request.ts                   # JSON and SSE HTTP requests
    │   ├── sse.ts                       # OpenAI image stream event parsing
    │   ├── save.ts                      # final and partial image saving
    │   ├── types.ts                     # shared types
    │   ├── errors.ts                    # typed CLI errors
    │   └── test.ts                      # local unit tests
    └── dist/
        └── openai_4k_image_generator.js
```

## 校验

从仓库 checkout 中先进入 skill 目录：

```powershell
cd .\sub2api-4k-image-generator-ts
```

运行本地测试：

```powershell
npm test
```

构建已编译 CLI：

```powershell
npm run build
```

检查 `skills.sh` / `npx skills` 是否能检测到仓库中的 skill：

```bash
npx skills add CaroLe-prw/sub2api-4k-image-generator-ts --list
```

## 诊断

- `1010`：请求到达 sub2api 前被 Cloudflare 拦截。为 `/v1/*` 添加或调整 WAF Skip rule。
- `524`：请求已到达 origin，但没有在限定时间内完成。保持 streaming 开启，并检查服务端 keepalive。
- `partial image received`：stream 仍然存活，上游图片生成已经开始。
- `*-partial-XX.png`：partial diagnostic image，不是最终 4K 输出。
- `<prefix>-XX.png`：最终保存的图片。

## 开发

```powershell
cd .\sub2api-4k-image-generator-ts
npm test
npm run build
```

测试覆盖 argument defaults、payload construction、URL selection、final image SSE extraction、partial image SSE extraction、response summaries 和 API key masking。

## Topics

`codex-skill`, `agent-skills`, `skills-sh`, `sub2api`, `openai-compatible`, `image-generation`, `4k-image-generator`, `typescript`, `nodejs`, `sse-streaming`, `cloudflare-524`, `responses-api`, `images-generations`
