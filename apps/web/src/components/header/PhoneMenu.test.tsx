/** @vitest-environment jsdom */

import { act, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogLifecycle } from "../story-dialog/use-dialog-lifecycle";
import { PhoneMenu } from "./PhoneMenu";

vi.mock("@aidr/ui", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./HeaderAuth", () => ({ HeaderAuth: () => null }));

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let mount: HTMLDivElement;
let trigger: HTMLButtonElement;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function OuterDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const panelRef = useDialogLifecycle(onClose);
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Outer"
      tabIndex={-1}
      data-testid="outer-dialog"
    >
      {children}
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <OuterDialog onClose={() => setOpen(false)}>
      <PhoneMenu lang="en" onLangChange={vi.fn()} langToggleDisabled={false} />
    </OuterDialog>
  );
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      })
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "auto";
  trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  mount = document.createElement("div");
  document.body.appendChild(mount);
  root = createRoot(mount);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
  }
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("PhoneMenu modal lifecycle", () => {
  it("shares the topmost modal stack and reference-counted body lock", async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    expect(document.activeElement).toBe(
      required<HTMLElement>("[data-testid=outer-dialog]")
    );
    const open = required<HTMLButtonElement>('[aria-label="Open menu"]');
    open.focus();
    await act(async () => {
      open.click();
    });

    expect(document.body.style.overflow).toBe("hidden");
    const menu = required<HTMLElement>('[role="dialog"][aria-label="Menu"]');
    expect(document.activeElement).toBe(menu);

    await pressEscape();
    expect(
      document.querySelector('[role="dialog"][aria-label="Menu"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="outer-dialog"]')
    ).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");

    await pressEscape();
    expect(document.querySelector('[data-testid="outer-dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
  });
});
