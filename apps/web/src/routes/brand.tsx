import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { pageHead } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export const Route = createFileRoute("/brand")({
  head: () =>
    pageHead({
      path: "/brand",
      title: "Brand | AI;DR",
      description:
        "Official AI;DR / aidr.today marks — download or copy URLs for reuse.",
    }),
  component: BrandPage,
});

const ASSETS = [
  {
    path: "/favicon.svg",
    name: "Favicon",
    note: "Site icon (yellow AI;DR mark)",
    checker: true,
  },
  {
    path: "/logo.svg",
    name: "Logo SVG",
    note: "Square yellow mark (vector)",
    checker: true,
  },
  {
    path: "/logo.png",
    name: "Large logo",
    note: "Square mark 640×640",
    checker: true,
  },
  {
    path: "/logo-sm.png",
    name: "Small logo",
    note: "Square mark 320×320",
    checker: true,
  },
  {
    path: "/logo-icon.png",
    name: "Icon PNG",
    note: "Square mark 128×128",
    checker: true,
  },
  {
    path: "/og.jpg",
    name: "Open Graph",
    note: "Social share image (1200×630)",
    checker: false,
  },
] as const;

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
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted"
    >
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
      } ${wide ? "col-span-2" : ""}`}
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
    <article className="typeset typeset-page py-12">
      <h1>Brand</h1>
      <p className="text-muted-foreground">
        Official marks for AI;DR / aidr.today. Download a file or copy its
        absolute URL for reuse. Do not redraw these marks.
      </p>

      <div className="mt-8 space-y-8">
        {ASSETS.map((asset) => {
          const url = `${SITE_URL}${asset.path}`;
          return (
            <section key={asset.path} className="scroll-mt-20">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {asset.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{asset.note}</p>
              <p className="mt-1 font-mono text-xs text-foreground">{url}</p>
              <div
                className={`mt-3 grid gap-2 ${asset.checker ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {asset.checker ? (
                  <>
                    <Preview src={asset.path} dark={false} />
                    <Preview src={asset.path} dark />
                  </>
                ) : (
                  <Preview src={asset.path} dark={false} wide />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyUrl url={url} />
                <a
                  href={asset.path}
                  download
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                >
                  Download
                </a>
                <a
                  href={asset.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                >
                  Open
                </a>
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
