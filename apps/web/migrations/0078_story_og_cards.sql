-- Story share cards rendered off-Worker (GitHub Actions) and served from the
-- `aidr-og` R2 bucket at og.aidr.today. One row per story and language: the
-- card hash last rendered. A page links og.aidr.today only while this hash
-- equals the story's current card hash and the card drew its photo (or had
-- none to draw). See ALGORITHM.md "Story share cards".
CREATE TABLE IF NOT EXISTS story_og_cards (
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'vi')),
  hash TEXT NOT NULL,
  -- 1 when a photo candidate existed but none could be drawn. Such a card
  -- is not uploaded; it is retried after a week.
  photoless INTEGER NOT NULL DEFAULT 0,
  rendered_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, lang)
);
