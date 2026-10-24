---
name: sub2api-4k-image-generator-ts
description: Generate, edit, and debug high-resolution images through sub2api using TypeScript/Node. Use for sub2api image generation or editing, 4K output, streaming Images or Responses APIs, Cloudflare 524 diagnostics, and partial image capture.
---

# sub2api 4K Image Generator TS

Use this skill when the user wants TypeScript/Node image generation or editing through sub2api rather than Codex's built-in image tool.

## Workflow

1. Work from the skill root that contains this `SKILL.md`.
2. Ensure `.env` or the process environment provides:

```env
SUB2API_BASE_URL=https://your-sub2api.example.com
SUB2API_API_KEY=sk-...
```

3. Prefer the compiled JS entrypoint for normal use:

```powershell
node .\dist\openai_4k_image_generator.js `
  "剑仙，云海，发光长剑，无文字无水印" `
  --size 3840x2160 `
  --quality high `
  --output-dir output
```

4. For development, run the TypeScript source:

```powershell
npx tsx .\scripts\openai_4k_image_generator.ts "test prompt" --dry-run
```

5. If Node/TypeScript is inconvenient, use the bundled Python request script:

```powershell
python .\openai_4k_image_request.py "test prompt" --dry-run
```

Install `python-dotenv` first if Python reports that `dotenv` is missing.

6. Report final image paths, partial image paths, and any Cloudflare/SSE diagnostic in plain language. Never print full API keys.

## Edit an existing image (Node entrypoint)

Inspect the input image, preserve the requested subject and other invariants, and pass the actual image with `--input-image`. Do not substitute a text-only regeneration.

```bash
node dist/openai_4k_image_generator.js \
  "保留原来的猫咪和窗边暖光，在身旁添加一只依偎着的小狗，无文字无水印" \
  --input-image /absolute/path/cat.png \
  --size 3840x2160 --quality high --output-dir /absolute/path/output
```

- With `--input-image`, the default `images` mode automatically uses `/v1/images/edits`. Explicit `--endpoint edits` is also supported and requires an input image. Paths, HTTP(S) URLs, and data URLs are accepted.
- This route uses the selected image model directly (default `gpt-image-2`), without a client-selected text model. Prefer it for image-only API-key groups.
- Use `--endpoint responses --responses-model MODEL` only when that workflow is intended and the key's group supports the selected text model. Do not guess text models or automatically retry through Responses after an ambiguous edit outcome.
- The Node parser accepts both `image_edit.completed` / `image_edit.partial_image` and `image_generation.*` events. Partials are never treated as final images. The Python fallback does not implement this direct-edit workflow; use the compiled Node entrypoint for edits.
- Use a new output directory or prefix to preserve the original. If a request produces no final image, report the diagnostic before retrying; do not automatically resend a potentially completed paid request.

## Notes

- Replace `SUB2API_BASE_URL` with the user's own deployed sub2api domain.
- The Node entrypoint accepts a base URL with or without a trailing `/v1`. Keep credentials in `.env` at the skill root or in the process environment; do not put real keys in skill files or examples.
- Treat 4K as explicit pixel sizes: `3840x2160` or `2160x3840`.
- Streaming is enabled by default to avoid Cloudflare 524 during slow 4K generation.
- `*-partial-XX.png` files are diagnostics only; final images are saved as `<prefix>-XX.png`.
- `openai_4k_image_request.py` is a standalone Python fallback that supports `/v1/images/generations`, `/v1/responses`, `--input-image`, streaming SSE, and `--dry-run`.
- After editing TypeScript, run `npm test` and `npm run build`; distribute the rebuilt `dist/` together with the source so the normal entrypoint includes the fix.
- The bundled `dist/` directory is enough for normal use; use `scripts/` only for development or debugging.
