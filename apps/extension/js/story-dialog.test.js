import assert from "node:assert/strict";
import { test } from "node:test";
import { bindAidrDialogLink, isUnmodifiedLeftClick } from "./story-dialog.js";

test("isUnmodifiedLeftClick ignores cmd/ctrl/middle clicks so the permalink still works", () => {
  assert.equal(isUnmodifiedLeftClick({ button: 0 }), true);
  assert.equal(isUnmodifiedLeftClick({ button: 1 }), false);
  assert.equal(isUnmodifiedLeftClick({ button: 0, metaKey: true }), false);
  assert.equal(isUnmodifiedLeftClick({ button: 0, ctrlKey: true }), false);
  assert.equal(isUnmodifiedLeftClick({ button: 0, shiftKey: true }), false);
  assert.equal(isUnmodifiedLeftClick({ button: 0, altKey: true }), false);
});

test("bindAidrDialogLink preventDefault on a plain left click", () => {
  const listeners = {};
  const anchor = {
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  };
  let opened = 0;
  bindAidrDialogLink(anchor, () => {
    opened += 1;
  });
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  listeners.click(plain);
  assert.equal(opened, 1);
  assert.equal(plain.prevented, true);

  const cmd = {
    button: 0,
    metaKey: true,
    preventDefault() {
      this.prevented = true;
    },
  };
  listeners.click(cmd);
  assert.equal(opened, 1);
  assert.equal(cmd.prevented, undefined);
});
