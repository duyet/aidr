/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaManifest } from "../../../worker/media.js";
import { MAX_MEDIA_ASSETS } from "../../../worker/media.js";
import { MediaGallery, visibleMediaAssets } from "./MediaGallery";

vi.mock("@aidr/ui/track", () => ({ track: vi.fn() }));

afterEach(cleanup);

const CDN = "https://cdn.example.test";
const ARTICLE = "https://blog.example.test/posts/one";

/** Build a manifest from raw, possibly hostile asset records. The public
 * payload is already validated upstream; these fixtures deliberately include
 * records the client must refuse so the render gate is actually exercised. */
const manifestOf = (assets: unknown[]): MediaManifest =>
  ({ version: 1, assets }) as unknown as MediaManifest;

const image = (path: string) => ({ type: "image", url: `${CDN}${path}` });
const video = (path: string, poster?: string) => ({
  type: "video",
  url: `${CDN}${path}`,
  ...(poster ? { poster_url: `${CDN}${poster}` } : {}),
});

function renderGallery(
  manifest?: MediaManifest,
  lang: "en" | "vi" = "en",
  extra: { fallbackImageUrl?: string | null; articleUrl?: string | null } = {}
) {
  return render(
    <MediaGallery
      manifest={manifest}
      fallbackImageUrl={extra.fallbackImageUrl ?? null}
      articleUrl={extra.articleUrl ?? ARTICLE}
      lang={lang}
      itemId="story-1"
    />
  );
}

/** Every URL the media policy must refuse before a manifest can be trusted. */
const HOSTILE_URLS = [
  "javascript:alert(1)",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "file:///etc/passwd",
  "http://127.0.0.1/media.jpg",
  "http://[::1]/media.jpg",
  "http://169.254.169.254/latest/meta-data/",
  "http://192.168.1.10/media.jpg",
  "http://localhost/media.jpg",
  "https://user:pass@cdn.example.test/media.jpg",
  "https://cdn.example.test:8443/media.jpg",
  "//cdn.example.test/protocol-relative.jpg",
];

describe("visibleMediaAssets", () => {
  it("keeps the manifest's own order with 1-based indices", () => {
    const assets = visibleMediaAssets(
      manifestOf([image("/b.jpg"), image("/a.jpg"), video("/c.mp4", "/p.jpg")])
    );
    expect(assets.map((a) => a.kind)).toEqual(["image", "image", "video"]);
    expect(assets.map((a) => a.index)).toEqual([1, 2, 3]);
    expect(assets.map((a) => a.url)).toEqual([
      `${CDN}/b.jpg`,
      `${CDN}/a.jpg`,
      `${CDN}/c.mp4`,
    ]);
  });

  it("caps at MAX_MEDIA_ASSETS without inspecting the rest", () => {
    const urls = Array.from(
      { length: MAX_MEDIA_ASSETS + 2 },
      (_, i) => `${CDN}/frame-${i}.jpg`
    );
    const assets = visibleMediaAssets(
      manifestOf(urls.map((url) => ({ type: "image", url })))
    );
    expect(assets).toHaveLength(MAX_MEDIA_ASSETS);
    // Everything past the cap is never touched, so it can never be fetched.
    expect(assets.at(-1)?.url).toBe(urls[MAX_MEDIA_ASSETS - 1]);
  });

  it("collapses an exact duplicate and a resize variant to one asset", () => {
    const assets = visibleMediaAssets(
      manifestOf([
        { type: "image", url: `${CDN}/hero.jpg?w=200` },
        { type: "image", url: `${CDN}/hero.jpg?w=800` },
        { type: "image", url: `${CDN}/hero.jpg?w=200` },
      ])
    );
    expect(assets).toHaveLength(1);
    // The first occurrence wins, verbatim: no URL rewriting on the way out.
    expect(assets[0].url).toBe(`${CDN}/hero.jpg?w=200`);
  });

  it("scopes identity by kind, so an image and a video never collapse", () => {
    const assets = visibleMediaAssets(
      manifestOf([
        { type: "image", url: `${CDN}/clip` },
        { type: "video", url: `${CDN}/clip` },
      ])
    );
    expect(assets.map((a) => a.kind)).toEqual(["image", "video"]);
  });

  it("drops every URL the media policy already rejected", () => {
    const assets = visibleMediaAssets(
      manifestOf(HOSTILE_URLS.map((url) => ({ type: "image", url })))
    );
    expect(assets).toEqual([]);
  });

  it("keeps a video but drops its rejected poster", () => {
    const assets = visibleMediaAssets(
      manifestOf([
        {
          type: "video",
          url: `${CDN}/clip.mp4`,
          poster_url: "http://10.0.0.1/p.jpg",
        },
      ])
    );
    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe("video");
    expect(assets[0]).toMatchObject({ poster: null });
  });

  it("tolerates absent, empty, and malformed manifests", () => {
    expect(visibleMediaAssets(undefined)).toEqual([]);
    expect(visibleMediaAssets(null)).toEqual([]);
    expect(visibleMediaAssets(manifestOf([]))).toEqual([]);
    expect(
      visibleMediaAssets({
        version: 1,
        assets: "nope",
      } as unknown as MediaManifest)
    ).toEqual([]);
    expect(
      visibleMediaAssets(
        manifestOf([
          null,
          7,
          { type: "audio", url: `${CDN}/a.mp3` },
          { url: "x" },
        ])
      )
    ).toEqual([]);
  });
});

describe("MediaGallery", () => {
  it("renders a single manifest image with a reserved box and no autoplay plumbing", () => {
    const { container } = renderGallery(manifestOf([image("/only.jpg")]));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(`${CDN}/only.jpg`);
    expect(img?.getAttribute("alt")).toBe(
      "Story image 1 of 1 from blog.example.test"
    );
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img?.getAttribute("width")).toBe("640");
    expect(img?.getAttribute("height")).toBe("360");
    expect(img?.getAttribute("class")).toContain("aspect-[16/9]");
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders multiple images in the manifest's order", () => {
    const { container } = renderGallery(
      manifestOf([
        image("/first.jpg"),
        image("/second.jpg"),
        image("/third.jpg"),
      ])
    );
    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src")
    );
    expect(srcs).toEqual([
      `${CDN}/first.jpg`,
      `${CDN}/second.jpg`,
      `${CDN}/third.jpg`,
    ]);
    expect(
      Array.from(container.querySelectorAll("img")).map((img) =>
        img.getAttribute("alt")
      )
    ).toEqual([
      "Story image 1 of 3 from blog.example.test",
      "Story image 2 of 3 from blog.example.test",
      "Story image 3 of 3 from blog.example.test",
    ]);
  });

  it("suppresses a duplicate resize variant instead of rendering it twice", () => {
    const { container } = renderGallery(
      manifestOf([
        { type: "image", url: `${CDN}/hero.jpg?w=200` },
        { type: "image", url: `${CDN}/hero.jpg?w=800` },
        image("/other.jpg"),
      ])
    );
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.innerHTML).not.toContain("w=800");
    expect(container.innerHTML).toContain("w=200");
  });

  it("renders an image plus a lazy, muted, non-autoplay video with the manifest poster", () => {
    const { container } = renderGallery(
      manifestOf([image("/still.jpg"), video("/clip.mp4", "/poster.jpg")])
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `${CDN}/still.jpg`
    );

    const el = container.querySelector("video");
    expect(el).not.toBeNull();
    const videoEl = el as HTMLVideoElement;
    expect(videoEl.getAttribute("src")).toBe(`${CDN}/clip.mp4`);
    expect(videoEl.getAttribute("poster")).toBe(`${CDN}/poster.jpg`);
    expect(videoEl.getAttribute("preload")).toBe("none");
    expect(videoEl.getAttribute("width")).toBe("640");
    expect(videoEl.getAttribute("height")).toBe("360");
    expect(videoEl.getAttribute("class")).toContain("aspect-[16/9]");
    // No autoplay, no autoplay audio.
    expect(videoEl.hasAttribute("autoplay")).toBe(false);
    expect(videoEl.hasAttribute("muted")).toBe(true);
    expect(videoEl.hasAttribute("playsinline")).toBe(true);
    // Native controls are the only play affordance, so it is keyboard-driven.
    expect(videoEl.hasAttribute("controls")).toBe(true);
    expect(videoEl.getAttribute("aria-label")).toBe(
      "Story video 2 of 2 from blog.example.test"
    );
  });

  it("gives a video a localized accessible label and a real fallback link", () => {
    const { container } = renderGallery(
      manifestOf([video("/clip.mp4", "/poster.jpg")])
    );
    const videoEl = container.querySelector("video") as HTMLVideoElement;
    const link = videoEl.querySelector("a");
    expect(link?.getAttribute("href")).toBe(`${CDN}/clip.mp4`);
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.textContent).toBe("Open the video file");
    expect(videoEl.textContent).toContain(
      "This browser cannot play this video."
    );
  });

  it("omits the poster attribute when the manifest has no poster", () => {
    const { container } = renderGallery(manifestOf([video("/clip.mp4")]));
    const videoEl = container.querySelector("video") as HTMLVideoElement;
    expect(videoEl.hasAttribute("poster")).toBe(false);
    expect(videoEl.getAttribute("src")).toBe(`${CDN}/clip.mp4`);
  });

  it("renders at most MAX_MEDIA_ASSETS and never the one past it", () => {
    const urls = Array.from(
      { length: MAX_MEDIA_ASSETS + 2 },
      (_, i) => `${CDN}/frame-${i}.jpg`
    );
    const { container } = renderGallery(
      manifestOf(urls.map((url) => ({ type: "image", url })))
    );
    expect(container.querySelectorAll("img")).toHaveLength(MAX_MEDIA_ASSETS);
    expect(container.innerHTML).not.toContain(`frame-${MAX_MEDIA_ASSETS}.jpg`);
    expect(container.innerHTML).not.toContain(
      `frame-${MAX_MEDIA_ASSETS + 1}.jpg`
    );
  });

  it("never renders the legacy thumbnail alongside manifest assets", () => {
    // A story whose image_url is also the manifest's primary asset must show
    // that asset once, not twice.
    const { container } = renderGallery(
      manifestOf([image("/only.jpg")]),
      "en",
      {
        fallbackImageUrl: `${CDN}/only.jpg`,
      }
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("falls back to the legacy single thumbnail when the manifest is empty", () => {
    const { container } = renderGallery(manifestOf([]), "en", {
      fallbackImageUrl: `${CDN}/legacy.jpg`,
    });
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `${CDN}/legacy.jpg`
    );
  });

  it("falls back to the legacy thumbnail when every asset is rejected", () => {
    const { container } = renderGallery(
      manifestOf(HOSTILE_URLS.map((url) => ({ type: "image", url }))),
      "en",
      { fallbackImageUrl: `${CDN}/legacy.jpg` }
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `${CDN}/legacy.jpg`
    );
  });

  it("renders nothing when there is no media at all", () => {
    const { container } = renderGallery(undefined);
    expect(container.innerHTML).toBe("");
  });

  it("localizes every label for EN and VI", () => {
    const story = manifestOf([
      image("/still.jpg"),
      video("/clip.mp4", "/p.jpg"),
    ]);

    const en = renderGallery(story, "en");
    expect(en.getByRole("heading").textContent).toBe("Story media");
    expect(
      (en.container.querySelector("video") as HTMLElement).getAttribute(
        "aria-label"
      )
    ).toBe("Story video 2 of 2 from blog.example.test");
    expect(en.container.querySelector("video a")?.textContent).toBe(
      "Open the video file"
    );
    cleanup();

    const vi = renderGallery(story, "vi");
    expect(vi.getByRole("heading").textContent).toBe(
      "Hình ảnh và video của bài viết"
    );
    expect(vi.container.querySelector("img")?.getAttribute("alt")).toBe(
      "Hình 1 trên 2 của bài viết từ blog.example.test"
    );
    expect(
      (vi.container.querySelector("video") as HTMLElement).getAttribute(
        "aria-label"
      )
    ).toBe("Video 2 trên 2 của bài viết từ blog.example.test");
    expect(vi.container.querySelector("video a")?.textContent).toBe(
      "Mở tệp video"
    );
    expect(
      vi.getByRole("button", { name: "Phóng to hình 1 trên 2" })
    ).toBeTruthy();
  });

  it("labels media without a publisher host", () => {
    const { container } = renderGallery(
      manifestOf([video("/clip.mp4")]),
      "en",
      {
        articleUrl: "",
      }
    );
    expect(
      (container.querySelector("video") as HTMLElement).getAttribute(
        "aria-label"
      )
    ).toBe("Story video 1 of 1");
  });

  it("falls back to the local site mark when an image fails", () => {
    const { container } = renderGallery(
      manifestOf([image("/broken.jpg"), image("/ok.jpg")])
    );
    const [broken, ok] = Array.from(container.querySelectorAll("img"));
    fireEvent.error(broken);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/favicon.svg"
    );
    // The healthy asset is untouched.
    expect(ok.getAttribute("src")).toBe(`${CDN}/ok.jpg`);
    expect(container.innerHTML).not.toContain("broken.jpg");
  });

  it("falls back to the manifest poster when a video fails", () => {
    const { container } = renderGallery(
      manifestOf([video("/clip.mp4", "/poster.jpg")])
    );
    fireEvent.error(container.querySelector("video") as HTMLVideoElement);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `${CDN}/poster.jpg`
    );
    // The source link survives the failure.
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      `${CDN}/clip.mp4`
    );
  });

  it("shows a localized note when a posterless video fails", () => {
    const { container } = renderGallery(manifestOf([video("/clip.mp4")]), "vi");
    fireEvent.error(container.querySelector("video") as HTMLVideoElement);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Video này không khả dụng.");
    expect(container.querySelector("a")?.textContent).toBe("Mở tệp video");
  });

  it("reopens the existing lightbox with the verbatim manifest URL", () => {
    const { container, getByRole } = renderGallery(
      manifestOf([image("/only.jpg")])
    );
    fireEvent.click(getByRole("button", { name: "Zoom image 1 of 1" }));
    const lightbox = document.querySelector(
      "img.story-dialog-lightbox-image"
    ) as HTMLImageElement | null;
    expect(lightbox?.getAttribute("src")).toBe(`${CDN}/only.jpg`);
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")
    ).toBe("true");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("never leaks a rejected URL into the DOM", () => {
    const { container } = renderGallery(
      manifestOf([
        ...HOSTILE_URLS.map((url) => ({ type: "image", url })),
        {
          type: "video",
          url: "javascript:alert(2)",
          poster_url: "data:image/png;base64,AA",
        },
        image("/legit.jpg"),
      ])
    );
    // Only the one accepted asset renders.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      `${CDN}/legit.jpg`
    );
    for (const url of HOSTILE_URLS) {
      expect(container.innerHTML).not.toContain(url);
    }
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.innerHTML).not.toContain("data:image");
    expect(container.innerHTML).not.toContain("169.254.169.254");
    expect(container.innerHTML).not.toContain("user:pass");
  });

  it("never leaks a media URL into visible or accessible text", () => {
    const { container } = renderGallery(
      manifestOf([
        image("/still.jpg"),
        video("/secret-path/clip.mp4", "/poster.jpg"),
      ])
    );
    const section = container.querySelector("section") as HTMLElement;
    // The URL is load-bearing in src/poster/href, and must appear nowhere
    // else: no visible text, no accessible name, no title.
    expect(section.textContent).not.toContain("cdn.example.test");
    expect(section.textContent).not.toContain("secret-path");
    expect(
      container.querySelector("video")?.getAttribute("aria-label")
    ).not.toContain("cdn.example.test");
    expect(
      container.querySelector("button[aria-label]")?.getAttribute("aria-label")
    ).not.toContain("cdn.example.test");
    expect(container.querySelector("img[title]")).toBeNull();
  });
});
