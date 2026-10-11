import { asArray, asRecord, asString, fetchSourceJson } from "./http.js";
import { clipFeedSummary } from "./rss.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

/**
 * Only `x.y.0` tags are news: patch releases, release candidates, alphas and
 * build-number tags (llama.cpp's `b11552`) are not. `rust-v0.163.0` is how
 * openai/codex names its tags, `v` is optional (`0.162.0`). A suffix such as
 * `-rc1`, `rc0`, `-alpha.3` or a `proto-` prefix does not match.
 */
export const MINOR_RELEASE_TAG = /^(?:rust-)?v?\d+\.\d+\.0$/;

export function isMinorReleaseTag(tag: string): boolean {
  return MINOR_RELEASE_TAG.test(tag);
}

const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

function releaseNotes(body: string): string | undefined {
  const text = body
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? clipFeedSummary(text) : undefined;
}

/**
 * Minor releases of one GitHub repository, from the REST API.
 *
 * The `releases.atom` feed is not used: github.com/robots.txt disallows
 * `/*.atom$` for `User-agent: *`, and this repo does not fetch what a
 * robots.txt disallows. `api.github.com` serves no robots.txt (404).
 * The API also says which releases are drafts and prereleases.
 *
 * Config: `repo` (`"ollama/ollama"`, required), `project` (display name for
 * the title, default the repo name). The title is `"<project> <tag>"` because
 * a bare tag gives the scorer nothing to judge. There is deliberately no
 * `feed` or `homepage`: those hosts are matched against item URLs
 * (`sourceSpecForUrl`), and a github.com row would claim every github.com link.
 */
export const githubReleasesAdapter: SourceAdapter = {
  type: "githubreleases",

  async fetchItems(config, sinceEpochSec) {
    const repo = asString(config.repo);
    if (!REPO_RE.test(repo)) {
      throw new Error("githubreleases: config.repo must be owner/name");
    }
    const project = asString(config.project) || repo.split("/")[1];
    const data = await fetchSourceJson(
      `https://api.github.com/repos/${repo}/releases?per_page=30`,
      "github releases",
      {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      }
    );
    const sinceMs = sinceEpochSec * 1000;
    const items: FetchedItem[] = [];
    for (const entry of asArray(data)) {
      const release = asRecord(entry);
      const tag = asString(release.tag_name);
      const url = asString(release.html_url);
      const publishedAt = Date.parse(asString(release.published_at));
      if (release.draft === true || release.prerelease === true) continue;
      if (!isMinorReleaseTag(tag)) continue;
      if (!url.startsWith("https://github.com/")) continue;
      if (!Number.isFinite(publishedAt) || publishedAt < sinceMs) continue;
      items.push({
        externalId: `${repo}@${tag}`,
        url,
        title: `${project} ${tag}`,
        summary: releaseNotes(asString(release.body)),
        publishedAt,
        sources: [
          { kind: "source", url, postedAt: Math.floor(publishedAt / 1000) },
        ],
      });
    }
    return items;
  },
};
