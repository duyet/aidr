import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AIDR_UNPACKED_DIR } from "./aidr-public";
import {
  AIDR_CWS_ZIP_FILENAME,
  buildAidrZip,
  buildCwsZip,
  defaultAidrZipDest,
  defaultCwsZipDest,
  listUnpackedRelPaths,
} from "./aidr-zip";

const here = dirname(fileURLToPath(import.meta.url));
const realRoot = join(here, "../../../extension");

function writeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aidr-zip-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function dv(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function decode(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

function zipNames(buf: Buffer): string[] {
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocd = buf.lastIndexOf(sig);
  if (eocd < 0) throw new Error("missing EOCD");
  const count = dv(buf).getUint16(eocd + 8, true);
  let offset = dv(buf).getUint32(eocd + 16, true);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (dv(buf).getUint32(offset, true) !== 0x02014b50) {
      throw new Error("bad central directory");
    }
    const nameLen = dv(buf).getUint16(offset + 28, true);
    const extraLen = dv(buf).getUint16(offset + 30, true);
    const commentLen = dv(buf).getUint16(offset + 32, true);
    names.push(decode(buf.subarray(offset + 46, offset + 46 + nameLen)));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function zipFileBytes(buf: Buffer, name: string): Buffer {
  let offset = 0;
  while (
    offset + 30 <= buf.length &&
    dv(buf).getUint32(offset, true) === 0x04034b50
  ) {
    const method = dv(buf).getUint16(offset + 8, true);
    const compSize = dv(buf).getUint32(offset + 18, true);
    const nameLen = dv(buf).getUint16(offset + 26, true);
    const extraLen = dv(buf).getUint16(offset + 28, true);
    const entryName = decode(buf.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (entryName === name) {
      return method === 8 ? inflateRawSync(data) : Buffer.from(data);
    }
    offset = dataStart + compSize;
  }
  throw new Error(`missing zip entry ${name}`);
}

describe("listUnpackedRelPaths", () => {
  it("keeps the MV3 tree and drops tests, docs, and node_modules", () => {
    const root = writeTree({
      "manifest.json": '{"manifest_version":3}',
      "newtab.html": "<html></html>",
      "options.html": "<html></html>",
      "css/newtab.css": "body{}",
      "js/api.js": "export {}",
      "js/api.test.js": "throw new Error('test')",
      "js/boot.js": "import './preview-shim.js'",
      "icons/icon.svg": "<svg></svg>",
      "_locales/en/messages.json": "{}",
      "README.md": "docs",
      "package.json": '{"name":"aidr"}',
      "node_modules/left-pad/index.js": "nope",
      "scripts/build.js": "nope",
      "dist/.valid": "nope",
      "store/README.md": "listing",
      "store/tile.png": "nope",
    });
    const rels = listUnpackedRelPaths(root);
    expect(rels).toContain("manifest.json");
    expect(rels).toContain("newtab.html");
    expect(rels).toContain("js/api.js");
    expect(rels).toContain("js/boot.js");
    expect(rels).toContain("_locales/en/messages.json");
    expect(rels).not.toContain("js/api.test.js");
    expect(rels).not.toContain("README.md");
    expect(rels).not.toContain("package.json");
    expect(rels).not.toContain("store/README.md");
    expect(rels).not.toContain("store/tile.png");
    expect(rels.some((r) => r.startsWith("node_modules/"))).toBe(false);
    expect(rels.some((r) => r.startsWith("scripts/"))).toBe(false);
    expect(rels.some((r) => r.startsWith("dist/"))).toBe(false);
    expect(rels.some((r) => r.startsWith("store/"))).toBe(false);
  });

  it("refuses a wrangler.toml next to the extension", () => {
    const root = writeTree({
      "manifest.json": "{}",
      "newtab.html": "<html></html>",
      "wrangler.toml": "name = 'nope'",
    });
    expect(() => listUnpackedRelPaths(root)).toThrow(/wrangler/);
  });
});

describe("buildAidrZip", () => {
  it("zips files under aidr/ so Load unpacked can pick that folder", () => {
    const root = writeTree({
      "manifest.json": '{"name":"AI News"}',
      "newtab.html": "<title>tab</title>",
      "js/api.js": "export const ok = 1;\n",
    });
    const zip = buildAidrZip(root);
    expect(decode(zip.subarray(0, 2))).toBe("PK");
    const names = zipNames(zip);
    expect(names).toContain(`${AIDR_UNPACKED_DIR}/manifest.json`);
    expect(names).toContain(`${AIDR_UNPACKED_DIR}/newtab.html`);
    expect(names).toContain(`${AIDR_UNPACKED_DIR}/js/api.js`);
    expect(names.every((n) => n.startsWith(`${AIDR_UNPACKED_DIR}/`))).toBe(
      true
    );
    expect(
      decode(zipFileBytes(zip, `${AIDR_UNPACKED_DIR}/manifest.json`))
    ).toBe('{"name":"AI News"}');
    expect(names).not.toContain("manifest.json");
  });

  it("packs the real apps/extension tree without tests", () => {
    const rels = listUnpackedRelPaths(realRoot);
    expect(rels).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "newtab.html",
        "options.html",
        "css/newtab.css",
        "js/api.js",
        "js/boot.js",
        "js/newtab.js",
        "icons/icon128.png",
        "_locales/en/messages.json",
        "_locales/vi/messages.json",
      ])
    );
    expect(rels.some((r) => r.endsWith(".test.js"))).toBe(false);
    const zip = buildAidrZip(realRoot);
    const names = zipNames(zip);
    expect(names).toContain(`${AIDR_UNPACKED_DIR}/manifest.json`);
    expect(names).not.toContain("manifest.json");
    expect(names.every((n) => n.startsWith(`${AIDR_UNPACKED_DIR}/`))).toBe(
      true
    );
    const manifest = JSON.parse(
      decode(zipFileBytes(zip, `${AIDR_UNPACKED_DIR}/manifest.json`))
    );
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.chrome_url_overrides.newtab).toBe("newtab.html");
    expect(manifest.optional_host_permissions).toEqual([
      "http://localhost/*",
      "http://127.0.0.1/*",
    ]);
    expect(manifest.content_security_policy.extension_pages).toMatch(
      /localhost/
    );
    expect(manifest.update_url).toBeUndefined();
  });
});

describe("buildCwsZip", () => {
  it("zips files at archive root, not under aidr/", () => {
    const root = writeTree({
      "manifest.json": '{"name":"AI News"}',
      "newtab.html": "<title>tab</title>",
      "js/api.js": "export const ok = 1;\n",
    });
    const zip = buildCwsZip(root);
    expect(decode(zip.subarray(0, 2))).toBe("PK");
    const names = zipNames(zip);
    expect(names).toContain("manifest.json");
    expect(names).toContain("newtab.html");
    expect(names).toContain("js/api.js");
    expect(names).not.toContain("aidr/manifest.json");
    expect(names).not.toContain(`${AIDR_UNPACKED_DIR}/manifest.json`);
    expect(names.some((n) => n.startsWith(`${AIDR_UNPACKED_DIR}/`))).toBe(
      false
    );
    expect(JSON.parse(decode(zipFileBytes(zip, "manifest.json")))).toEqual({
      name: "AI News",
    });
  });

  it("packs the real tree with manifest at root and no localhost", () => {
    const zip = buildCwsZip(realRoot);
    const names = zipNames(zip);
    expect(names).toContain("manifest.json");
    expect(names).toContain("newtab.html");
    expect(names).not.toContain("aidr/manifest.json");
    expect(names).not.toContain(`${AIDR_UNPACKED_DIR}/manifest.json`);
    expect(names.some((n) => n.startsWith(`${AIDR_UNPACKED_DIR}/`))).toBe(
      false
    );
    expect(names.some((n) => n.endsWith(".test.js"))).toBe(false);
    const manifest = JSON.parse(decode(zipFileBytes(zip, "manifest.json")));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.chrome_url_overrides.newtab).toBe("newtab.html");
    expect(manifest.host_permissions).toEqual(["https://aidr.today/*"]);
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.update_url).toBeUndefined();
    const csp = manifest.content_security_policy.extension_pages as string;
    expect(csp).toContain("https://aidr.today");
    expect(csp).not.toMatch(/localhost/);
    expect(csp).not.toMatch(/127\.0\.0\.1/);
  });

  it("does not share the public nested zip destination", () => {
    const web = "/tmp/apps/web";
    expect(defaultAidrZipDest(web)).toBe("/tmp/apps/web/public/aidr.zip");
    expect(defaultCwsZipDest(web)).toBe(
      `/tmp/apps/extension/dist/${AIDR_CWS_ZIP_FILENAME}`
    );
    expect(defaultCwsZipDest(web)).not.toBe(defaultAidrZipDest(web));
  });
});
