import { describe, expect, it } from "vitest";
import { isSubmittedId, submitErrorMessage } from "./submit-feedback";

/**
 * These fixtures mirror the response shapes the Start client produces. None of
 * them carry a real credential, cookie, or captured request header.
 */

describe("submitErrorMessage", () => {
  it("passes a short plain-text server message through", () => {
    expect(submitErrorMessage(new Error("story already submitted"), "en")).toBe(
      "story already submitted"
    );
    expect(submitErrorMessage(new Error("Invalid URL"), "vi")).toBe(
      "Invalid URL"
    );
  });

  it("turns auth wording into localized, actionable copy", () => {
    expect(submitErrorMessage(new Error("Sign in required"), "en")).toBe(
      "Sign in again to submit a story."
    );
    expect(submitErrorMessage(new Error("Sign in required"), "vi")).toBe(
      "Hãy đăng nhập lại để gửi bài."
    );
  });

  it("explains a router-path rejection thrown as a raw string", () => {
    // Start rethrows `result.error` verbatim for a `{error}` JSON body, so the
    // value is a string, not an Error.
    const thrown = "Only HTML requests are supported here";
    expect(thrown).not.toBeInstanceOf(Error);
    expect(submitErrorMessage(thrown, "en")).toBe(
      "The page is out of date. Reload and try again."
    );
    expect(submitErrorMessage(thrown, "vi")).toBe(
      "Trang đã cũ. Hãy tải lại rồi thử lại."
    );
  });

  it("falls back to localized copy for a notFound/redirect object", () => {
    expect(submitErrorMessage({ isNotFound: true, data: {} }, "en")).toBe(
      "Could not submit. Please try again."
    );
    expect(submitErrorMessage({ isNotFound: true, data: {} }, "vi")).toBe(
      "Không gửi được. Vui lòng thử lại."
    );
    expect(
      submitErrorMessage({ isSerializedRedirect: true, href: "/submit" }, "en")
    ).toBe("Could not submit. Please try again.");
  });

  it("points at sign-in when the rejection carries only auth wording", () => {
    expect(submitErrorMessage({ error: "unauthorized" }, "en")).toBe(
      "Sign in again to submit a story."
    );
    expect(submitErrorMessage({ error: "unauthorized" }, "vi")).toBe(
      "Hãy đăng nhập lại để gửi bài."
    );
  });

  it("never renders a server document or payload as the error text", () => {
    const html = new Error(
      '<!doctype html><html lang="en"><body>Invalid locale request</body></html>'
    );
    expect(submitErrorMessage(html, "en")).toBe(
      "Could not submit. Please try again."
    );

    const json = new Error('{"error":"boom","stack":"at foo"}');
    expect(submitErrorMessage(json, "en")).toBe(
      "Could not submit. Please try again."
    );

    const trace = new Error(`x ${"y".repeat(400)}`);
    expect(submitErrorMessage(trace, "en")).toBe(
      "Could not submit. Please try again."
    );
  });

  it("does not leak internals from a rejected object payload", () => {
    const payload = {
      isNotFound: true,
      href: "/__clerk?token=super-secret-value",
      data: { authorization: "Bearer super-secret-value" },
    };
    const message = submitErrorMessage(payload, "en");
    expect(message).not.toContain("super-secret-value");
    expect(message).toBe("Could not submit. Please try again.");
  });

  it("maps network failures to actionable localized copy", () => {
    expect(submitErrorMessage(new TypeError("Failed to fetch"), "en")).toBe(
      "Could not reach the server. Check your connection and try again."
    );
    expect(submitErrorMessage(new TypeError("Failed to fetch"), "vi")).toBe(
      "Không kết nối được máy chủ. Hãy kiểm tra kết nối rồi thử lại."
    );
  });

  it("handles a rejection that carries no usable detail at all", () => {
    for (const lang of ["en", "vi"] as const) {
      expect(submitErrorMessage(undefined, lang)).toBe(
        lang === "vi"
          ? "Không gửi được. Vui lòng thử lại."
          : "Could not submit. Please try again."
      );
      expect(submitErrorMessage({}, lang)).not.toBe("");
    }
  });
});

describe("isSubmittedId", () => {
  it("accepts only a real submission id", () => {
    expect(isSubmittedId({ id: "sub_1" })).toBe(true);
    expect(isSubmittedId({ id: "" })).toBe(false);
    expect(
      isSubmittedId({ error: "Only HTML requests are supported here" })
    ).toBe(false);
    expect(isSubmittedId(undefined)).toBe(false);
    expect(isSubmittedId(null)).toBe(false);
    expect(isSubmittedId("sub_1")).toBe(false);
    expect(isSubmittedId(["sub_1"])).toBe(false);
  });
});
