-- Aggregate reader-interest counts. One row per story, UTC day, arrival
-- channel and kind. No reader identifier, IP, user agent or cookie is
-- stored anywhere; the row is the only record. `kind` is 'open' (story
-- expanded or its page visited) or 'outbound' (click to the publisher).
-- `channel` is the analytics CHANNELS enum plus 'web' for a visit with no
-- ref/utm. `count` is capped by the Worker (READ_ROW_CAP in worker/reads.ts).
CREATE TABLE IF NOT EXISTS item_reads (
  item_id TEXT NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('open', 'outbound')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, day, channel, kind)
);
CREATE INDEX IF NOT EXISTS idx_item_reads_day ON item_reads (day);
