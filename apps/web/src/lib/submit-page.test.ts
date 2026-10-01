import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
// /contribute (history) and /contribute/new (form) share ContributeShell;
// /submit only redirects to the form.
const src = [
  "../components/contribute/ContributeShell.tsx",
  "../components/submit/SubmitForm.tsx",
  "../components/submit/ContributionsList.tsx",
  "../components/submit/SubmitGate.tsx",
]
  .map((p) => readFileSync(join(here, p), "utf8"))
  .join("\n");

describe("submit page keeps the form after success", () => {
  it("does not swap the form away on sent", () => {
    expect(src).not.toMatch(/status === ["']sent["']/);
    expect(src).toContain("setBanner(true)");
    expect(src).toContain('setUrl("")');
    expect(src).toContain('setTitle("")');
    expect(src).toContain('setNote("")');
    expect(src).toContain('role="status"');
  });

  // History and the form are separate pages so a long history never
  // pushes the form off screen, and /submit keeps old links working.
  it("splits history (/contribute) from the form (/contribute/new)", () => {
    const route = (p: string) => readFileSync(join(here, p), "utf8");
    expect(route("../routes/contribute.index.tsx")).toContain('mode="list"');
    expect(route("../routes/contribute.new.tsx")).toContain('mode="new"');
    expect(route("../routes/submit.tsx")).toMatch(
      /redirect\(\{\s*to: "\/contribute\/new"/
    );
    // The list links to the form, and a sent story lands back on the list.
    expect(src).toMatch(/<Link[\s\S]*to="\/contribute\/new"/);
    expect(src).toMatch(/onSubmitted[\s\S]*to: "\/contribute"/);
  });

  it("keeps the signed-out gate", () => {
    expect(src).toContain("Sign in to submit");
    expect(src).toContain("Đăng nhập để gửi bài");
    expect(src).toContain("mod.SignedOut");
    expect(src).toContain("mod.SignedIn");
  });
});
