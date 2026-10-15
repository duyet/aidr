/**
 * The UTM tag on aidr.today links in what the video scripts post, the same
 * convention as the Worker's apps/web/worker/utm.ts: source is the channel,
 * medium `social` (or `video` on YouTube), campaign the edition
 * (`digest-<date>`, `release-<version>`), content the slot.
 */

const SITE_LINK = /https:\/\/aidr\.today(?:\/[^\s<>"')\]]*)?/g;

/** `url` with the tag, unless it already carries a utm param. */
export function siteLink(url, { source, medium, campaign, content }) {
  const u = new URL(url);
  if ([...u.searchParams.keys()].some((k) => k.startsWith("utm_"))) return url;
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

/** Every aidr.today link in `text`, tagged. Sentence punctuation after a link stays outside it. */
export function tagSiteLinks(text, tag) {
  return text.replace(SITE_LINK, (match) => {
    const [, link, tail] = match.match(/^(.*?)([.,;:!?]*)$/);
    return siteLink(link, tag) + tail;
  });
}
