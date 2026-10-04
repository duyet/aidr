import assert from "node:assert/strict";
import {
  collidingBinding,
  redactSecrets,
  selectPage,
  upsertEnv,
} from "./facebook-page-token.js";

const one = selectPage(
  [{ id: "100", name: "Example", access_token: "page-token" }],
  ""
);
assert.equal(one.id, "100");

const chosen = selectPage(
  [
    { id: "100", name: "Example" },
    { id: "200", name: "Other" },
  ],
  "200"
);
assert.equal(chosen.id, "200");

assert.throws(
  () => selectPage([{ id: "100" }, { id: "200" }], ""),
  /FACEBOOK_PAGE_ID/
);

const written = upsertEnv("FACEBOOK_APP_ID=app\nOTHER=1\n", {
  FACEBOOK_APP_ID: "app",
  FACEBOOK_PAGE_ID: "100",
  FACEBOOK_PAGE_ACCESS_TOKEN: "page-token",
});
assert.match(written, /^FACEBOOK_APP_ID=app$/m);
assert.match(written, /^OTHER=1$/m);
assert.match(written, /^FACEBOOK_PAGE_ID=100$/m);
assert.match(written, /^FACEBOOK_PAGE_ACCESS_TOKEN=page-token$/m);

assert.equal(
  collidingBinding("[10053] Binding name 'FACEBOOK_PAGE_ID' already in use"),
  "FACEBOOK_PAGE_ID"
);
assert.equal(collidingBinding("something else"), undefined);
assert.equal(
  redactSecrets("token EAAZexample and page-token", ["page-token"]),
  "token [redacted] and [redacted]"
);

console.log("facebook-page-token tests passed");
