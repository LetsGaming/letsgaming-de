-- How far back analytics have been deliberately deleted.
--
-- Clearing a range removes the aggregate rows, but the access log on the proxy
-- host is untouched — it's the source, and nothing here can (or should) edit it.
-- The ingest normally can't re-read those lines because it tracks a byte offset,
-- but that offset resets whenever the file shrinks, which is exactly what a log
-- rotation looks like. One rotation after a clear and the whole current log is
-- re-read, resurrecting everything the operator just deleted.
--
-- So a delete records a watermark, and the ingest drops lines older than it. That
-- makes "clear" durable against a re-read instead of being a race against the
-- next rotation.
--
-- A single row (id = 1, enforced by the CHECK) rather than a key/value table:
-- there is one watermark for the whole store, and a schema that can only hold one
-- is easier to reason about than a convention that it holds one.
CREATE TABLE IF NOT EXISTS analytics_clear_marker (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  cleared_through TEXT NOT NULL          -- UTC hour bucket, YYYY-MM-DDTHH
);
