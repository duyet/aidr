/**
 * @vitest-environment happy-dom
 *
 * Covers the submit form's feedback contract. The server function is mocked, so
 * the fixtures are only the response shapes the Start client produces — no
 * credential, cookie, or captured request header is used here.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";
import { SubmitForm } from "./SubmitForm";

const submitStory = vi.fn();
vi.mock("../../lib/submit-fn", () => ({
  submitStory: (...args: unknown[]) => submitStory(...args),
}));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ children, ...props }: { children?: unknown }) =>
      React.createElement("a", props, children as never),
  };
});

afterEach(() => {
  cleanup();
  submitStory.mockReset();
});

function renderForm(lang: Lang) {
  return render(
    <LangContext.Provider value={lang}>
      <SubmitForm
        userId="user_test"
        userName="Tester"
        getToken={async () => null}
        onSubmitted={vi.fn()}
      />
    </LangContext.Provider>
  );
}

/** Fill the URL field and press submit; assertions wait for the outcome. */
function submit(lang: Lang) {
  renderForm(lang);
  fireEvent.change(screen.getByPlaceholderText("https://..."), {
    target: { value: "https://example.com/story" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Gửi bài|Submit/ }));
}

describe("SubmitForm feedback", () => {
  it("explains a router-path rejection instead of a bare 'Failed to submit'", async () => {
    // Start rethrows the raw `error` string of a `{error}` JSON body, so the
    // rejection is a string rather than an Error.
    submitStory.mockRejectedValue("Only HTML requests are supported here");

    await submit("en");

    await waitFor(() => {
      expect(
        screen.getByText("The page is out of date. Reload and try again.")
      ).toBeTruthy();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("localizes the rejection for lang=vi", async () => {
    submitStory.mockRejectedValue("Only HTML requests are supported here");

    await submit("vi");

    await waitFor(() => {
      expect(
        screen.getByText("Trang đã cũ. Hãy tải lại rồi thử lại.")
      ).toBeTruthy();
    });
  });

  it("shows a localized message for a notFound payload", async () => {
    submitStory.mockRejectedValue({ isNotFound: true, data: {} });

    await submit("en");

    await waitFor(() => {
      expect(
        screen.getByText("Could not submit. Please try again.")
      ).toBeTruthy();
    });
  });

  it("never renders a server document as the error text", async () => {
    submitStory.mockRejectedValue(
      new Error("<!doctype html><html><body>Invalid locale</body></html>")
    );

    await submit("en");

    await waitFor(() => {
      expect(
        screen.getByText("Could not submit. Please try again.")
      ).toBeTruthy();
    });
    expect(document.body.innerHTML).not.toContain("<!doctype");
  });

  it("confirms a real submission and refreshes the list", async () => {
    const onSubmitted = vi.fn();
    submitStory.mockResolvedValue({ id: "sub_123" });
    render(
      <LangContext.Provider value="en">
        <SubmitForm
          userId="user_test"
          userName="Tester"
          getToken={async () => null}
          onSubmitted={onSubmitted}
        />
      </LangContext.Provider>
    );

    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.com/story" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(
      document.querySelector<HTMLInputElement>("input[type=url]")?.value
    ).toBe("");
  });

  it("does not report success when the response is not a submission id", async () => {
    // Start hands an unrecognized body back as-is; that must not be shown as
    // a successful submit with the form cleared.
    submitStory.mockResolvedValue({
      error: "Only HTML requests are supported here",
    });
    const onSubmitted = vi.fn();
    render(
      <LangContext.Provider value="en">
        <SubmitForm
          userId="user_test"
          userName="Tester"
          getToken={async () => null}
          onSubmitted={onSubmitted}
        />
      </LangContext.Provider>
    );

    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.com/story" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));

    await waitFor(() => {
      expect(
        screen.getByText("The page is out of date. Reload and try again.")
      ).toBeTruthy();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLInputElement>("input[type=url]")?.value
    ).toBe("https://example.com/story");
  });

  it("sends the bearer token when one is available", async () => {
    submitStory.mockResolvedValue({ id: "sub_1" });
    render(
      <LangContext.Provider value="en">
        <SubmitForm
          userId="user_test"
          userName="Tester"
          getToken={async () => "test-token-placeholder"}
          onSubmitted={vi.fn()}
        />
      </LangContext.Provider>
    );

    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.com/story" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));

    await waitFor(() => expect(submitStory).toHaveBeenCalledOnce());
    expect(submitStory.mock.calls[0]?.[0]).toMatchObject({
      headers: { Authorization: "Bearer test-token-placeholder" },
    });
  });
});
