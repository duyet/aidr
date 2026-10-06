import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getRequestHeaderMock = vi.hoisted(() => vi.fn());
const verifyClerkTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/tanstack-react-start/server", () => ({
  auth: authMock,
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: getRequestHeaderMock,
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("../../worker/admin/clerk.js", () => ({
  verifyClerkToken: verifyClerkTokenMock,
}));

import { requireClerkUser } from "./clerk-auth-fn";

beforeEach(() => {
  authMock.mockReset();
  getRequestHeaderMock.mockReset();
  verifyClerkTokenMock.mockReset();
});

describe("requireClerkUser", () => {
  it("returns the cookie session user without touching the Bearer path", async () => {
    authMock.mockResolvedValue({
      userId: "user_1",
      sessionClaims: { username: "ada" },
    });

    await expect(requireClerkUser()).resolves.toEqual({
      userId: "user_1",
      userName: "ada",
    });
    expect(getRequestHeaderMock).not.toHaveBeenCalled();
    expect(verifyClerkTokenMock).not.toHaveBeenCalled();
  });

  it("throws Sign in required when auth() fails and no Authorization header", async () => {
    authMock.mockRejectedValue(new Error("no clerk request context"));
    getRequestHeaderMock.mockReturnValue(undefined);

    await expect(requireClerkUser()).rejects.toThrow("Sign in required");
    expect(verifyClerkTokenMock).not.toHaveBeenCalled();
  });

  it("throws Sign in required when the Bearer token does not verify", async () => {
    authMock.mockRejectedValue(new Error("no clerk request context"));
    getRequestHeaderMock.mockReturnValue("Bearer not-a-jwt");
    verifyClerkTokenMock.mockResolvedValue(null);

    await expect(requireClerkUser()).rejects.toThrow("Sign in required");
    expect(verifyClerkTokenMock).toHaveBeenCalledWith("not-a-jwt", {});
  });

  it("returns the verified Bearer token sub when auth() fails", async () => {
    authMock.mockRejectedValue(new Error("no clerk request context"));
    getRequestHeaderMock.mockReturnValue("Bearer some.jwt.token");
    verifyClerkTokenMock.mockResolvedValue({
      sub: "user_2",
      iss: "https://issuer.example",
      exp: 0,
    });

    await expect(requireClerkUser()).resolves.toEqual({
      userId: "user_2",
      userName: "user_2",
    });
    expect(verifyClerkTokenMock).toHaveBeenCalledWith("some.jwt.token", {});
  });
});
