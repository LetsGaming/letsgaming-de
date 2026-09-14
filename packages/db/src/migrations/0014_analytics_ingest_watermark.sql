-- When the access-log ingest last *succeeded*, and what the most recent
-- attempt's error was, if it failed.
--
-- The ingest already tracked a byte offset per source, but nothing about
-- whether the last run actually worked — a dead ingest (log rotation reset,
-- the file becoming unreadable, a bad path after a deploy) left the offset
-- untouched and produced zero visible signal anywhere. A quiet day and a
-- broken pipeline both looked exactly like "the numbers stopped moving."
--
-- Reuses the existing `analytics_state` row (one per log source) rather than
-- a new table: it's already keyed by source, and a second table keyed the
-- same way would just be two places that could disagree about which source
-- they describe.
--
-- `last_success_at` only ever moves forward on an actual success; a failed
-- attempt leaves it alone and writes `last_error` instead, so "last known
-- good data" survives across however many failed attempts follow it.
ALTER TABLE analytics_state ADD COLUMN last_success_at TEXT;
ALTER TABLE analytics_state ADD COLUMN last_error TEXT;
