import assert from "node:assert/strict";
import {
  collidingBinding,
  collidingBindings,
  collisionSkip,
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
assert.equal(
  written,
  "FACEBOOK_APP_ID=app\nOTHER=1\n\nFACEBOOK_PAGE_ID=100\nFACEBOOK_PAGE_ACCESS_TOKEN=page-token\n"
);

const duplicated = upsertEnv("TOKEN=old\nTOKEN=older\n", { TOKEN: "new" });
assert.equal(duplicated, "TOKEN=new\nTOKEN=new\n");
assert.equal(upsertEnv("", { A: "1", B: "2" }), "A=1\nB=2\n");

assert.equal(
  collidingBinding("[10053] Binding name 'FACEBOOK_PAGE_ID' already in use"),
  "FACEBOOK_PAGE_ID"
);
assert.deepEqual(
  collidingBindings(
    "Binding name 'FACEBOOK_PAGE_ID' already in use. Please use a different name and try again. [code: 10053]\nBinding name 'FACEBOOK_APP_ID' already in use. Please use a different name and try again."
  ),
  ["FACEBOOK_PAGE_ID", "FACEBOOK_APP_ID"]
);
assert.equal(collidingBinding("something else"), undefined);
assert.deepEqual(
  collisionSkip(
    ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_APP_ID"],
    "Binding name 'FACEBOOK_PAGE_ID' already in use. Please use a different name and try again. Binding name 'FACEBOOK_APP_ID' already in use."
  ),
  {
    keep: ["FACEBOOK_PAGE_ACCESS_TOKEN"],
    skipped: ["FACEBOOK_PAGE_ID", "FACEBOOK_APP_ID"],
  }
);
assert.equal(
  collisionSkip(["FACEBOOK_PAGE_ACCESS_TOKEN"], "HTTP 401"),
  undefined
);
assert.equal(
  redactSecrets("token EAAZexample and page-token", ["page-token"]),
  "token [redacted] and [redacted]"
);
assert.equal(
  redactSecrets("id 12345678 inside 123456789999 token", [
    "12345678",
    "123456789999",
  ]),
  "id [redacted] inside [redacted] token"
);

console.log("facebook-page-token tests passed");
