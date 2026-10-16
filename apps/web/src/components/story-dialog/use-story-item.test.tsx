/**
 * A late response for story A must never render under story B after the
 * reader switches (the `cancelled` guard in useStoryItem).
 *
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedItem, Lang } from "../../lib/types";
import { storyApiUrl, useStoryItem } from "./use-story-item";

const storyOf = (id: string): FeedItem =>
  ({ id, title: `Story ${id}` }) as unknown as FeedItem;

type Resolver = (res: Response | Error) => void;

function stubDeferredFetch() {
  const pending = new Map<string, Resolver>();
  const fetchMock = vi.fn(
    (url: string) =>
      new Promise<Response>((resolve, reject) => {
        pending.set(url, (res) =>
          res instanceof Error ? reject(res) : resolve(res)
        );
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    answer: (id: string, lang: Lang, res: Response | Error) =>
      act(async () => {
        pending.get(storyApiUrl(id, lang))?.(res);
      }),
  };
}

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useStoryItem stale requests", () => {
  it("ignores a late success for the previous story after the id changes", async () => {
    const net = stubDeferredFetch();
    const { result, rerender } = renderHook(
      ({ id }) => useStoryItem(id, "en"),
      { initialProps: { id: "aaaaaaaa" } }
    );
    rerender({ id: "bbbbbbbb" });

    await net.answer("bbbbbbbb", "en", json(200, storyOf("b")));
    await net.answer("aaaaaaaa", "en", json(200, storyOf("a")));

    expect(result.current.state).toEqual({
      status: "ready",
      item: storyOf("b"),
    });
  });

  it("ignores a late 404 for the previous story", async () => {
    const net = stubDeferredFetch();
    const { result, rerender } = renderHook(
      ({ id }) => useStoryItem(id, "en"),
      { initialProps: { id: "aaaaaaaa" } }
    );
    rerender({ id: "bbbbbbbb" });

    await net.answer("bbbbbbbb", "en", json(200, storyOf("b")));
    await net.answer("aaaaaaaa", "en", json(404));

    expect(result.current.state.status).toBe("ready");
  });

  it("ignores a late network failure for the previous story", async () => {
    const net = stubDeferredFetch();
    const { result, rerender } = renderHook(
      ({ id }) => useStoryItem(id, "en"),
      { initialProps: { id: "aaaaaaaa" } }
    );
    rerender({ id: "bbbbbbbb" });

    await net.answer("bbbbbbbb", "en", json(200, storyOf("b")));
    await net.answer("aaaaaaaa", "en", new TypeError("Failed to fetch"));

    expect(result.current.state.status).toBe("ready");
  });

  it("stays loading while only the previous story has answered", async () => {
    const net = stubDeferredFetch();
    const { result, rerender } = renderHook(
      ({ id }) => useStoryItem(id, "en"),
      { initialProps: { id: "aaaaaaaa" } }
    );
    rerender({ id: "bbbbbbbb" });

    await net.answer("aaaaaaaa", "en", json(200, storyOf("a")));

    expect(result.current.state).toEqual({ status: "loading" });
  });
});
