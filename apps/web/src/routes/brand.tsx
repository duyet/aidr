import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { useState } from "react";
import { ContentPage } from "../components/ContentPage";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export const Route = createFileRoute("/brand")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/brand",
      title: "Brand | AI;DR",
      description:
        "Official AI;DR / aidr.today marks — download or copy URLs for reuse.",
      route: headRouteInput(match),
    }),
  component: BrandPage,
});

/** `wide` assets get one large light preview; square marks get light + dark. */
const ASSETS: { path: string; name: string; note: string; wide?: true }[] = [
  {
    path: "/favicon.svg",
    name: "Favicon",
    note: "Vector site icon (yellow AI;DR mark). The wordmark is outlined, not <text>, so it renders without fonts.",
  },
  {
    path: "/favicon-120x120.png",
    name: "Favicon 120×120",
    note: "Raster site icon for search engines that skip SVG. Yandex asks for 120×120.",
  },
  {
    path: "/favicon.ico",
    name: "Favicon ICO",
    note: "Root icon with 16, 32, and 48 px sizes in one file.",
  },
  {
    path: "/apple-touch-icon.png",
    name: "Apple touch icon",
    note: "Square mark, 180×180.",
  },
  { path: "/logo.svg", name: "Logo SVG", note: "Square yellow mark, vector." },
  { path: "/logo.png", name: "Large logo", note: "Square mark, 640×640." },
  { path: "/logo-sm.png", name: "Small logo", note: "Square mark, 320×320." },
  { path: "/logo-icon.png", name: "Icon PNG", note: "Square mark, 128×128." },
  {
    path: "/og.jpg",
    name: "Open Graph",
    note: "Social share image, 1200×630.",
    wide: true,
  },
];

const BUTTON =
  "rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted";

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copy} className={BUTTON}>
      {copied ? "Copied" : "Copy URL"}
    </button>
  );
}

function Preview({
  src,
  dark,
  wide,
}: {
  src: string;
  dark: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={`flex min-h-24 items-center justify-center rounded-lg border border-border/80 p-4 ${
        dark ? "bg-stone-900" : "bg-stone-50"
      }`}
    >
      <a href={src} target="_blank" rel="noopener noreferrer">
        <img
          src={src}
          alt=""
          className={
            wide ? "max-h-20 w-auto max-w-full" : "h-12 w-auto max-w-full"
          }
        />
      </a>
    </div>
  );
}

function BrandPage() {
  return (
    <ContentPage
      title="Brand"
      lede="Official AI;DR and aidr.today marks. Download a file or copy its URL. Please do not redraw them."
    >
      <div className="mt-8 space-y-8">
        {ASSETS.map(({ path, name, note, wide }) => {
          const url = `${SITE_URL}${path}`;
          return (
            <section key={path}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{note}</p>
              <p className="mt-1 font-mono text-xs text-foreground">{url}</p>
              <div
                className={`mt-3 grid gap-2 ${wide ? "grid-cols-1" : "grid-cols-2"}`}
              >
                <Preview src={path} dark={false} wide={wide} />
                {wide ? null : <Preview src={path} dark />}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyUrl url={url} />
                <a href={path} download className={BUTTON}>
                  Download
                </a>
                <a
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BUTTON}
                >
                  Open
                </a>
              </div>
            </section>
          );
        })}
      </div>
    </ContentPage>
  );
}
