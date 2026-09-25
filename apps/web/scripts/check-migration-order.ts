#!/usr/bin/env tsx
/** Read-only local migration filename/order check; it never invokes Wrangler. */
import {
  assertMigrationFileOrder,
  migrationFiles,
  requiredMigrationsForFiles,
} from "./verify-translation-schema.js";

const files = migrationFiles();
assertMigrationFileOrder(files);
console.log(
  `migration order verified (${requiredMigrationsForFiles(files).join(", ")})`
);
