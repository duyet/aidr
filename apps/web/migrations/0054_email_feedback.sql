-- "Was today's edition useful?" votes from the digest mail.
--
-- GET /feedback?d=<date>&l=<lang>&v=1|0&t=<subscriber token> writes one row
-- per subscriber and edition date. A second click (or a link scanner's
-- pre-click followed by the reader's own) overwrites the vote: last click
-- wins. `subscriber_token` is the subscriber's unsubscribe token, kept so the
-- vote stays per reader without storing the address. Nothing is seeded.
CREATE TABLE IF NOT EXISTS email_feedback (
  date TEXT NOT NULL,
  subscriber_token TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'vi')),
  vote INTEGER NOT NULL CHECK (vote IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date, subscriber_token)
);

CREATE INDEX IF NOT EXISTS idx_email_feedback_date_lang
  ON email_feedback (date, lang);
