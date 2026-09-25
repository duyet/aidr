# Test fixtures

`raster.ts` builds minimal, structurally valid containers in code so the exact
header bytes under test stay reviewable in a diff.

## `webp-lossless-*.webp`

Real lossless WebP files, **not** hand-built. Each is a *simple* VP8L chunk
(38 bytes) produced by libwebp with `lossless: true` for a solid-colour image,
and each was decoded back through libwebp to confirm the dimensions it declares
before being committed.

VP8L is the only WebP variant whose canvas size is not carried by a dedicated
chunk: it is packed into the bitstream header as two 14-bit fields inside one
28-bit little-endian run, which is easy to get wrong. These files pin the real
thing down.

| file | dimensions | why |
| --- | --- | --- |
| `webp-lossless-1x1.webp` | 1x1 | minimal, both fields zero |
| `webp-lossless-16x16.webp` | 16x16 | both fields cross the byte 22/23 boundary |
| `webp-lossless-300x200.webp` | 300x200 | ordinary multi-byte size |
| `webp-lossless-1200x630.webp` | 1200x630 | the real story OG card size |
| `webp-lossless-1024x13.webp` | 1024x13 | extreme aspect ratio |
| `webp-lossless-255x257.webp` | 255x257 | height crosses the mid-14-bit mark |
| `webp-lossless-4096x1.webp` | 4096x1 | exactly at the accepted side ceiling |
| `webp-lossless-4097x1.webp` | 4097x1 | one past the ceiling, must be rejected |
| `webp-lossless-300x200-alpha.webp` | 300x200 | sets `alpha_is_used` (bit 28) |

`webpLosslessBytes()` in `raster.ts` reproduces these **byte for byte**; a test
asserts that, so the in-code encoder cannot drift from real libwebp output. It
can also encode sizes that have no committed file, which the boundary tests use
for the 16384-wide and 2048x2048 rejection cases.

## Regenerating

```sh
pnpm exec tsx --tsconfig apps/web/tsconfig.json \
  apps/web/scripts/generate-webp-lossless-fixtures.ts
```

The generator is authoring-time only: the test suite reads the committed files
and never runs it. `sharp` (which wraps libwebp) reaches the workspace through
`miniflare`, an existing `@aidr/web` devDependency, so no new dependency is
needed and nothing here touches the network. Re-running it is byte-stable.
