# First-party thumbnails (issue #229, item 5)

Status: decided, not built.

## Decision

Keep story thumbnails hot-linked from the publisher (through
`resizeCdnImageUrl`), with the branded `/api/og/{id}.png` card as the fallback.
Do not mirror or proxy thumbnails to first-party storage for now.

## Why

- The LCP element is a text row, not an image (see `TldrBulletList.ssr.test.tsx`).
  Since #243 the thumbnails are `loading="eager"` with `fetchpriority="low"`, so
  they no longer compete with the stylesheet. A first-party copy would not move
  the LCP number this issue tracks.
- Mirroring means fetching, storing and serving other sites' images. That adds
  storage and egress cost, a cleanup job, and a copyright and takedown surface,
  for no measured gain.
- The images already have reserved space (`width`/`height` attributes and a
  `2lh` box), so a late third-party image does not shift layout.

## Revisit when

Lighthouse or field data shows a thumbnail as the LCP element, or third-party
image hosts cause repeated broken thumbnails. Then measure a small first-party
resize proxy against this baseline before building it.
