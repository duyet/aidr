import { type RefObject, useEffect, useRef } from "react";

type ModalEntry = {
  root: HTMLElement;
  onEscape: () => void;
};

type BackgroundSnapshot = {
  element: HTMLElement;
  inertAttribute: string | null;
  inertProperty: boolean | null;
  ariaHidden: string | null;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const modalStack: ModalEntry[] = [];
let bodyLockCount = 0;
let bodyOverflowBeforeLock = "";
let listenersAttached = false;

function topModal(): ModalEntry | undefined {
  return modalStack[modalStack.length - 1];
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => {
    if (
      element.hidden ||
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-hidden") === "true" ||
      element.getAttribute("tabindex") === "-1"
    ) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function focusWithinTopModal(event: KeyboardEvent): void {
  const entry = topModal();
  if (!entry) return;

  const focusable = getFocusableElements(entry.root);
  if (focusable.length === 0) {
    event.preventDefault();
    entry.root.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!active || !entry.root.contains(active) || active === entry.root) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  const entry = topModal();
  if (!entry) return;
  if (event.key === "Escape") {
    event.preventDefault();
    entry.onEscape();
  } else if (event.key === "Tab") {
    focusWithinTopModal(event);
  }
}

function onDocumentFocusIn(event: FocusEvent): void {
  const entry = topModal();
  if (!entry) return;
  const target = event.target;
  if (target instanceof Node && entry.root.contains(target)) return;

  const first = getFocusableElements(entry.root)[0] ?? entry.root;
  first.focus();
}

function attachListeners(): void {
  if (listenersAttached) return;
  document.addEventListener("keydown", onDocumentKeyDown);
  document.addEventListener("focusin", onDocumentFocusIn);
  listenersAttached = true;
}

function detachListeners(): void {
  if (!listenersAttached) return;
  document.removeEventListener("keydown", onDocumentKeyDown);
  document.removeEventListener("focusin", onDocumentFocusIn);
  listenersAttached = false;
}

function lockBodyScroll(): void {
  if (bodyLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBodyScroll(): void {
  if (bodyLockCount === 0) return;
  bodyLockCount -= 1;
  if (bodyLockCount > 0) return;
  document.body.style.overflow = bodyOverflowBeforeLock;
  bodyOverflowBeforeLock = "";
}

function setElementInert(element: HTMLElement, inert: boolean): void {
  if ("inert" in element) element.inert = inert;
  if (inert) element.setAttribute("inert", "");
  else element.removeAttribute("inert");
}

function inertBackground(container: HTMLElement): () => void {
  const elements = new Set<HTMLElement>();
  let current: HTMLElement | null = container;
  while (current && current !== document.body) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;
    for (const child of Array.from(parent.children)) {
      if (child !== current && child instanceof HTMLElement)
        elements.add(child);
    }
    current = parent instanceof HTMLElement ? parent : null;
  }
  const snapshots: BackgroundSnapshot[] = Array.from(elements).map(
    (element) => ({
      element,
      inertAttribute: element.getAttribute("inert"),
      inertProperty: "inert" in element ? Boolean(element.inert) : null,
      ariaHidden: element.getAttribute("aria-hidden"),
    })
  );

  for (const element of elements) {
    setElementInert(element, true);
    element.setAttribute("aria-hidden", "true");
  }

  return () => {
    for (const snapshot of snapshots) {
      const { element } = snapshot;
      if (snapshot.inertProperty !== null && "inert" in element) {
        element.inert = snapshot.inertProperty;
      }
      if (snapshot.inertAttribute === null) element.removeAttribute("inert");
      else element.setAttribute("inert", snapshot.inertAttribute);
      if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", snapshot.ariaHidden);
    }
  };
}

function registerModal(
  root: HTMLElement,
  container: HTMLElement,
  onEscape: () => void
): () => void {
  const trigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  modalStack.push({ root, onEscape });
  lockBodyScroll();
  const restoreBackground = inertBackground(container);
  attachListeners();
  let registered = true;

  return () => {
    if (!registered) return;
    registered = false;
    const index = modalStack.findIndex((entry) => entry.root === root);
    if (index >= 0) modalStack.splice(index, 1);
    restoreBackground();
    unlockBodyScroll();
    if (modalStack.length === 0) detachListeners();
    if (trigger?.isConnected) trigger.focus();
  };
}

/** Modal lifecycle: reference-counts the body lock, contains focus, and lets
 * only the topmost modal handle Escape. The panel is focused on open and the
 * previously active element is restored on close. */
export function useDialogLifecycle(
  onClose: () => void,
  containerRef?: RefObject<HTMLElement | null>
) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const container = containerRef?.current ?? panel;
    const unregister = registerModal(panel, container, () =>
      onCloseRef.current()
    );
    panel.focus();
    return unregister;
  }, []);

  return panelRef;
}
