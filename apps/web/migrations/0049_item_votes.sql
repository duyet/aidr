-- One vote per signed-in reader per story.
--
-- `value` is +1 (up) or -1 (down). Clearing a vote deletes the row, so
-- SUM(value) is the net that rank_score folds into reader engagement.
-- The primary key is the unique (item_id, user_id) pair. `updated_at` is
-- epoch seconds of the last change. Nothing is seeded here.
CREATE TABLE IF NOT EXISTS item_votes (
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (1, -1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, user_id)
);
