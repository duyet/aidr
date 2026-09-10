import { describe, expect, it } from "vitest";
import {
  attachTldrBulletImages,
  collectTldrItemIds,
  imageUrlByItemId,
  resizeCdnImageUrl,
  sanitizeImageUrl,
  withTldrImages,
} from "./tldr-images";

describe("sanitizeImageUrl", () => {
  it("decodes HTML-escaped query ampersands", () => {
    expect(
      sanitizeImageUrl(
        "https://pbs.twimg.com/card_img/1/x?format=jpg&amp;name=orig"
      )
    ).toBe("https://pbs.twimg.com/card_img/1/x?format=jpg&name=orig");
  });

  it("decodes double-escaped ampersands", () => {
    expect(sanitizeImageUrl("https://img.example/a?w=1&amp;amp;h=2")).toBe(
      "https://img.example/a?w=1&h=2"
    );
  });

  it("drops non-http URLs", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageUrl("")).toBeNull();
    expect(sanitizeImageUrl(null)).toBeNull();
  });
});

describe("resizeCdnImageUrl", () => {
  it("rewrites Twitter :large media to a small named variant", () => {
    expect(
      resizeCdnImageUrl(
        "https://pbs.twimg.com/media/HRnvjcJbkAASzlf.jpg:large",
        "thumb"
      )
    ).toBe(
      "https://pbs.twimg.com/media/HRnvjcJbkAASzlf.jpg?format=jpg&name=small"
    );
  });

  it("rewrites Twitter name=orig query to small", () => {
    expect(
      resizeCdnImageUrl(
        "https://pbs.twimg.com/card_img/1/x?format=jpg&name=orig",
        "thumb"
      )
    ).toBe("https://pbs.twimg.com/card_img/1/x?format=jpg&name=small");
  });

  it("skips oversized Google blog width-NNNN files as thumbs", () => {
    expect(
      resizeCdnImageUrl(
        "https://storage.googleapis.com/gweb-uniblog-publish-prod/images/WeatherNext3_Title.width-1300.png",
        "thumb"
      )
    ).toBeNull();
  });

  it("keeps oversized Google blog files for cards", () => {
    expect(
      resizeCdnImageUrl(
        "https://storage.googleapis.com/gweb-uniblog-publish-prod/images/WeatherNext3_Title.width-1300.png",
        "card"
      )
    ).toBe(
      "https://storage.googleapis.com/gweb-uniblog-publish-prod/images/WeatherNext3_Title.width-1300.png"
    );
  });

  it("leaves unknown hosts unchanged", () => {
    expect(
      resizeCdnImageUrl("https://www.bottlenecklabs.com/blog/og.jpg", "thumb")
    ).toBe("https://www.bottlenecklabs.com/blog/og.jpg");
  });

  it("uses a larger Twitter name for full zoom", () => {
    expect(
      resizeCdnImageUrl(
        "https://pbs.twimg.com/media/HRnvjcJbkAASzlf.jpg:large",
        "full"
      )
    ).toBe(
      "https://pbs.twimg.com/media/HRnvjcJbkAASzlf.jpg?format=jpg&name=large"
    );
  });
});

describe("imageUrlByItemId", () => {
  it("keeps only non-empty image URLs", () => {
    const map = imageUrlByItemId([
      { id: "a", image_url: "https://img.example/a.jpg" },
      { id: "b", image_url: null },
      { id: "c", image_url: "" },
      { id: "d" },
    ]);
    expect([...map.entries()]).toEqual([["a", "https://img.example/a.jpg"]]);
  });

  it("decodes HTML-escaped query ampersands before mapping", () => {
    const map = imageUrlByItemId([
      {
        id: "a",
        image_url: "https://img.example/a.jpg?format=jpg&amp;name=orig",
      },
    ]);
    expect(map.get("a")).toBe("https://img.example/a.jpg?format=jpg&name=orig");
  });
});

describe("collectTldrItemIds", () => {
  it("unions item_ids from both languages without duplicates", () => {
    expect(
      collectTldrItemIds({
        bullets_en: [
          { text: "A", item_ids: ["a"] },
          { text: "B", item_ids: ["b", "c"] },
        ],
        bullets_vi: [{ text: "A vi", item_ids: ["a"] }, { text: "orphan" }],
      }).sort()
    ).toEqual(["a", "b", "c"]);
  });

  it("returns empty for a missing snapshot", () => {
    expect(collectTldrItemIds(null)).toEqual([]);
  });
});

describe("attachTldrBulletImages", () => {
  const images = new Map([
    ["a", "https://img.example/a.jpg"],
    ["c", "https://img.example/c.jpg"],
  ]);

  it("copies the first linked story image and leaves others unchanged", () => {
    expect(
      attachTldrBulletImages(
        [
          { text: "Has image", item_ids: ["a"] },
          { text: "No image", item_ids: ["b"] },
          { text: "Cluster", item_ids: ["b", "c"] },
          {
            text: "Already set",
            item_ids: ["a"],
            image_url: "https://keep.me/x.png",
          },
          { text: "No ids" },
        ],
        images
      )
    ).toEqual([
      {
        text: "Has image",
        item_ids: ["a"],
        image_url: "https://img.example/a.jpg",
      },
      { text: "No image", item_ids: ["b"] },
      {
        text: "Cluster",
        item_ids: ["b", "c"],
        image_url: "https://img.example/c.jpg",
      },
      {
        text: "Already set",
        item_ids: ["a"],
        image_url: "https://keep.me/x.png",
      },
      { text: "No ids" },
    ]);
  });
});

describe("withTldrImages", () => {
  it("attaches images on both languages without mutating the input", () => {
    const tldr = {
      date: "2026-08-27",
      bullets_en: [{ text: "EN", item_ids: ["a"] }],
      bullets_vi: [{ text: "VI", item_ids: ["a"] }],
    };
    const out = withTldrImages(
      tldr,
      new Map([["a", "https://img.example/a.jpg"]])
    );
    expect(out?.bullets_en[0]?.image_url).toBe("https://img.example/a.jpg");
    expect(out?.bullets_vi[0]?.image_url).toBe("https://img.example/a.jpg");
    expect(tldr.bullets_en[0]).not.toHaveProperty("image_url");
  });

  it("passes null through", () => {
    expect(withTldrImages(null, new Map())).toBeNull();
  });
});
