# @aidr/libs

Small shared helpers, imported as TypeScript source. There is no build step.

| Import | Contents |
|---|---|
| `@aidr/libs/utils` | `cn`, the class-name join. |
| `@aidr/libs/workers-auth` | `getBearerToken` and `timingSafeEqualStrings` for Worker token checks. |

Consumers are `apps/web` and `@aidr/ui`.

```bash
pnpm --filter @aidr/libs lint
```

The package has no tests of its own. Cover a change through a consumer, for example `pnpm --filter @aidr/web test`.

Compare secrets only with `timingSafeEqualStrings`, never with `===`.
