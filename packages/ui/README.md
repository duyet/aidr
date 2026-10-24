# @aidr/ui

Shared React components and design tokens, imported as source (`index.tsx`). There is no build step.

## Entrypoints

| Import                   | Contents                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `@aidr/ui`               | The components in `ui/` (button, card, tabs, sheet, and others), `AuthButtons`, `ThemeProvider`. |
| `@aidr/ui/ThemeProvider` | Light and dark theme provider.                                                                   |
| `@aidr/ui/tokens.css`    | Design tokens for color and type.                                                                |
| `@aidr/ui/styles.css`    | Base styles.                                                                                     |

## Commands

```bash
pnpm --filter @aidr/ui lint
pnpm --filter @aidr/ui test          # tokens.test.mjs
pnpm --filter @aidr/ui sync-tokens   # copy tokens.css into the extension
```

## Gotchas

- The Chrome extension loads CSS without a bundler. `sync-tokens` copies `tokens.css` to `apps/extension/css/tokens.css`, and `tokens.test.mjs` fails when the two drift. Run `sync-tokens` after any token edit.
- `@clerk/tanstack-react-start` is an optional peer dependency. Components must not require it.
