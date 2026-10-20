/**
 * @vitest-environment happy-dom
 *
 * The Clerk calls and the server functions are mocked: this covers the form's
 * sequence (send code, verify, sync, show the new address) and its errors.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContributorEmails } from "./ContributorEmails";

const fetchContributorEmails = vi.fn();
const syncContributorEmails = vi.fn();
vi.mock("../../lib/contribute-email-fn", () => ({
  fetchContributorEmails: (...args: unknown[]) =>
    fetchContributorEmails(...args),
  syncContributorEmails: (...args: unknown[]) => syncContributorEmails(...args),
}));

afterEach(() => {
  cleanup();
  fetchContributorEmails.mockReset();
  syncContributorEmails.mockReset();
});

function fakeUser(verifyStatus: string = "verified") {
  const address = {
    prepareVerification: vi.fn(async () => ({})),
    attemptVerification: vi.fn(async () => ({
      verification: { status: verifyStatus },
    })),
    destroy: vi.fn(async () => ({})),
  };
  return {
    address,
    user: {
      createEmailAddress: vi.fn(async () => address),
      reload: vi.fn(async () => ({})),
    },
  };
}

function setup(user = fakeUser()) {
  fetchContributorEmails.mockResolvedValue(["me@example.com"]);
  render(
    <ContributorEmails lang="en" getToken={async () => null} user={user.user} />
  );
  return user;
}

describe("ContributorEmails", () => {
  it("lists the verified addresses and has no add form without a user", async () => {
    fetchContributorEmails.mockResolvedValue(["me@example.com"]);
    render(<ContributorEmails lang="en" getToken={async () => null} />);
    expect(await screen.findByText("me@example.com")).toBeTruthy();
    expect(screen.queryByLabelText("Add an email address")).toBeNull();
  });

  it("adds an address: code, verify, sync, then lists it", async () => {
    const { user, address } = setup();
    syncContributorEmails.mockResolvedValue({
      emails: ["me@example.com", "work@example.com"],
      synced: true,
    });
    await screen.findByText("me@example.com");
    fireEvent.change(screen.getByLabelText("Add an email address"), {
      target: { value: " work@example.com " },
    });
    fireEvent.click(screen.getByText("Send code"));
    await screen.findByLabelText("Code sent to work@example.com");
    expect(user.createEmailAddress).toHaveBeenCalledWith({
      email: "work@example.com",
    });
    expect(address.prepareVerification).toHaveBeenCalledWith({
      strategy: "email_code",
    });
    fireEvent.change(screen.getByLabelText(/Code sent to/), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByText("Verify"));
    expect(await screen.findByText("work@example.com")).toBeTruthy();
    expect(address.attemptVerification).toHaveBeenCalledWith({
      code: "123456",
    });
    expect(syncContributorEmails).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Verified.");
  });

  it("keeps the address out of the list when the code is wrong", async () => {
    const { address } = setup(fakeUser("unverified"));
    await screen.findByText("me@example.com");
    fireEvent.change(screen.getByLabelText("Add an email address"), {
      target: { value: "work@example.com" },
    });
    fireEvent.click(screen.getByText("Send code"));
    fireEvent.change(await screen.findByLabelText(/Code sent to/), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByText("Verify"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("not right")
    );
    expect(syncContributorEmails).not.toHaveBeenCalled();
    expect(screen.queryByText("work@example.com")).toBeNull();
    expect(address.attemptVerification).toHaveBeenCalledTimes(1);
  });

  it("shows Clerk's message when the address cannot be added", async () => {
    const user = fakeUser();
    user.user.createEmailAddress.mockRejectedValueOnce({
      errors: [{ longMessage: "That email address is taken." }],
    });
    setup(user);
    await screen.findByText("me@example.com");
    fireEvent.change(screen.getByLabelText("Add an email address"), {
      target: { value: "taken@example.com" },
    });
    fireEvent.click(screen.getByText("Send code"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "That email address is taken."
      )
    );
  });

  it("cancel removes the unverified address from the account", async () => {
    const { address } = setup();
    await screen.findByText("me@example.com");
    fireEvent.change(screen.getByLabelText("Add an email address"), {
      target: { value: "work@example.com" },
    });
    fireEvent.click(screen.getByText("Send code"));
    await screen.findByLabelText(/Code sent to/);
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(address.destroy).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Add an email address")).toBeTruthy();
  });
});
