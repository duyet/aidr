import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extensionMetaUrl,
  isChromeWebStoreInstall,
  isNewerVersion,
  parseVersion,
} from "./update.js";

test("parseVersion reads x.y.z and ignores junk suffixes", () => {
  assert.deepEqual(parseVersion("0.1.2"), [0, 1, 2]);
  assert.deepEqual(parseVersion("1.0.0-beta"), [1, 0, 0]);
  assert.equal(parseVersion("nope"), null);
  assert.equal(parseVersion(""), null);
});

test("isNewerVersion is strict and ignores equals", () => {
  assert.equal(isNewerVersion("0.1.3", "0.1.2"), true);
  assert.equal(isNewerVersion("0.2.0", "0.1.9"), true);
  assert.equal(isNewerVersion("1.0.0", "0.9.9"), true);
  assert.equal(isNewerVersion("0.1.2", "0.1.2"), false);
  assert.equal(isNewerVersion("0.1.2", "0.1.3"), false);
  assert.equal(isNewerVersion("bad", "0.1.2"), false);
});

test("isChromeWebStoreInstall only matches Google's update service", () => {
  assert.equal(
    isChromeWebStoreInstall({
      update_url: "https://clients2.google.com/service/update2/crx",
    }),
    true
  );
  assert.equal(isChromeWebStoreInstall({}), false);
  assert.equal(
    isChromeWebStoreInstall({ update_url: "https://aidr.today/crx" }),
    false
  );
});

test("extensionMetaUrl uses the API base", () => {
  assert.equal(
    extensionMetaUrl("https://aidr.today/"),
    "https://aidr.today/api/extension"
  );
});
