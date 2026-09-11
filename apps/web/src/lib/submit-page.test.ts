import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../routes/submit.tsx"), "utf8");

describe("submit page keeps the form after success", () => {
  it("does not swap the form away on sent", () => {
    expect(src).not.toMatch(/status === ["']sent["']/);
    expect(src).toContain("setBanner(true)");
    expect(src).toContain('setUrl("")');
    expect(src).toContain('setTitle("")');
    expect(src).toContain('setNote("")');
    expect(src).toContain('role="status"');
  });

  it("puts history beside the form on md+", () => {
    expect(src).toContain("md:grid-cols-2");
    expect(src).toContain("Your submissions");
    expect(src).toContain("Bài đã gửi");
    expect(src).toContain("refreshKey");
    expect(src).toContain("onSubmitted");
    expect(src).toMatch(/<SubmissionsList[\s\S]*refreshKey=\{listKey\}/);
    expect(src.indexOf("</form>")).toBeLessThan(
      src.indexOf("<SubmissionsList")
    );
  });

  it("keeps the signed-out gate", () => {
    expect(src).toContain("Sign in to submit");
    expect(src).toContain("Đăng nhập để gửi bài");
    expect(src).toContain("mod.SignedOut");
    expect(src).toContain("mod.SignedIn");
  });
});
