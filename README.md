# sub2api 4K Image Generator TS Skill

[![skills.sh](https://skills.sh/b/fengyunzaidushi/sub2api-4k-image-generator-ts)](https://skills.sh/fengyunzaidushi/sub2api-4k-image-generator-ts)

A Codex-compatible agent skill and TypeScript CLI for generating, streaming, saving, and debugging high-resolution AI images through a sub2api OpenAI-compatible endpoint.

Use it when you need a local `SUB2API_BASE_URL` / `SUB2API_API_KEY` based image workflow for `/v1/images/generations` or `/v1/responses`, especially 4K outputs such as `3840x2160` and `2160x3840`, streaming partial-image diagnostics, and Cloudflare 524 timeout troubleshooting.

## Install

Install the current skill for Codex:

```bash
npx skills add fengyunzaidushi/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts -a codex
```

A correct install should create a skill directory containing `SKILL.md`, `dist/`, `scripts/`, and `package.json`. If you only see `SKILL.md`, you installed an older root-level layout; refresh with the update command below.

Install for all detected agents:

```bash
npx skills add fengyunzaidushi/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts
```

List the skill detected in this repository without installing it:

```bash
npx skills add fengyunzaidushi/sub2api-4k-image-generator-ts --list
```

Use the skill prompt without installing:

```bash
npx skills use fengyunzaidushi/sub2api-4k-image-generator-ts@sub2api-4k-image-generator-ts
```

## Update

Recommended way to refresh the Codex install:

```bash
npx skills add fengyunzaidushi/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts -a codex -y --copy
```

Refresh all detected agents:

```bash
npx skills add fengyunzaidushi/sub2api-4k-image-generator-ts --skill sub2api-4k-image-generator-ts --all --copy
```

Why this uses `skills add` instead of `skills update`:

`npx skills update sub2api-4k-image-generator-ts -p -y` may fail with `Failed to check for deleted skills` or `Failed to update`. In that case, run the recommended `skills add ... -y --copy` command above to overwrite the installed copy with the latest repository version.

## Use

Example prompt after installation:

```text
Use $sub2api-4k-image-generator-ts to generate a 4K landscape image through my sub2api endpoint and save the final image path.
```

The skill will:

- inspect the local `.env` or process environment for `SUB2API_BASE_URL` and `SUB2API_API_KEY`
- generate explicit 4K payloads for `3840x2160` or `2160x3840`
- prefer streaming requests so slow 4K jobs can avoid Cloudflare 524 failures
- capture final images and partial diagnostic images from SSE events
- support both `/v1/images/generations` and `/v1/responses`
- report saved image paths and diagnostics without printing full API keys

## CLI Setup

Create or update `.env` where you run the CLI:

```env
SUB2API_BASE_URL=https://your-sub2api.example.com
SUB2API_API_KEY=sk-...
```

Replace `https://your-sub2api.example.com` with your own deployed sub2api domain. You can also override it per command with `--base-url https://your-sub2api.example.com`.

Install dependencies for development:

```powershell
cd .\sub2api-4k-image-generator-ts
npm install
```

## CLI Run

Preferred compiled JavaScript:

```powershell
node .\dist\openai_4k_image_generator.js `
  "cinematic xianxia sword immortal, sea of clouds, glowing sword, no text, no watermark" `
  --size 3840x2160 `
  --quality high `
  --output-dir output
```

TypeScript source:

```powershell
npx tsx .\scripts\openai_4k_image_generator.ts `
  "cinematic xianxia sword immortal, sea of clouds, glowing sword, no text, no watermark" `
  --size 3840x2160 `
  --quality high `
  --output-dir output
```

Dry run:

```powershell
npm run dry-run
```

## CLI Options

- `--size 3840x2160` for landscape 4K
- `--size 2160x3840` for portrait 4K
- `--endpoint images` for `/v1/images/generations`
- `--endpoint responses` for `/v1/responses`
- `--input-image ./input.png` with `--endpoint responses`
- `--no-stream` to debug non-streaming behavior
- `--dry-run` to print URL and JSON body without sending

## Repository Layout

```text
.
├── README.md
├── LICENSE
└── sub2api-4k-image-generator-ts/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
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

## Validate

From a repository checkout, enter the skill directory first:

```powershell
cd .\sub2api-4k-image-generator-ts
```

Run the local test suite:

```powershell
npm test
```

Build the compiled CLI:

```powershell
npm run build
```

Check `skills.sh` / `npx skills` repository detection:

```bash
npx skills add fengyunzaidushi/sub2api-4k-image-generator-ts --list
```

## Diagnostics

- `1010`: Cloudflare blocked the request before it reached sub2api. Add or adjust WAF Skip rules for `/v1/*`.
- `524`: The request reached the origin but did not complete fast enough. Keep streaming enabled and check server-side keepalive behavior.
- `partial image received`: The stream is alive and upstream generation started.
- `*-partial-XX.png`: Partial diagnostic image. It is not the final 4K output.
- `<prefix>-XX.png`: Final saved image.

## Development

```powershell
cd .\sub2api-4k-image-generator-ts
npm test
npm run build
```

The tests cover argument defaults, payload construction, URL selection, final image SSE extraction, partial image SSE extraction, response summaries, and API key masking.

## Topics

`codex-skill`, `agent-skills`, `skills-sh`, `sub2api`, `openai-compatible`, `image-generation`, `4k-image-generator`, `typescript`, `nodejs`, `sse-streaming`, `cloudflare-524`, `responses-api`, `images-generations`
