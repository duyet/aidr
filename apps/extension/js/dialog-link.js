/**
 * Click binding for story links that open the in-tab reader. Kept apart from
 * story-dialog.js so the new tab loads the reader only on first open.
 */

/** Left-click without modifiers — same gate as the website StoryDialog. */
export function isUnmodifiedLeftClick(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function bindAidrDialogLink(anchor, onOpen) {
  anchor.addEventListener("click", (event) => {
    if (!isUnmodifiedLeftClick(event)) return;
    event.preventDefault();
    onOpen();
  });
}

/** Load the reader module on demand, then open it. */
export function openStoryDialogLazy(options) {
  return import("./story-dialog.js").then((mod) =>
    mod.openStoryDialog(options)
  );
}
