import { describe, expect, it } from "vitest";
import { assetRefs } from "./deploy-assets";

describe("assetRefs", () => {
  it("lists every distinct /assets/* reference in the HTML", () => {
    const html = `<link rel="modulepreload" href="/assets/routes-C9lUwA6g.js">
<link rel="stylesheet" href="/assets/index-DoMdo6yM.css">
<script type="module" src="/assets/index-uAJIDAo6.js"></script>
<script>import("/assets/routes-C9lUwA6g.js")</script>
<link rel="icon" href="/favicon.svg"><img src="/media/x.webp">`;
    expect(assetRefs(html)).toEqual([
      "/assets/index-DoMdo6yM.css",
      "/assets/index-uAJIDAo6.js",
      "/assets/routes-C9lUwA6g.js",
    ]);
  });
});
