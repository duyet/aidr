-- Failed review attempts per submission. A row whose review keeps throwing is
-- skipped after the attempt cap so it cannot hold the head of the queue.
ALTER TABLE submissions ADD COLUMN review_attempts INTEGER NOT NULL DEFAULT 0;
