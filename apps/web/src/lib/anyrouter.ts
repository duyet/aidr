const MODEL_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** Validate a public model id before it is used as a link target. */
export function isValidAnyrouterModel(model: string): boolean {
  const value = model.trim();
  if (!value || value.length > 160) return false;
  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment !== "." && segment !== ".." && MODEL_SEGMENT.test(segment)
  );
}

/** Public AnyRouter model detail page; encode each path segment defensively. */
export function anyrouterModelUrl(model: string): string {
  const value = model.trim();
  const path = isValidAnyrouterModel(value)
    ? value.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(value);
  return `https://anyrouter.dev/model/${path}?ref=aidr.today`;
}
