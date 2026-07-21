-- CMS-owned config for the Wrapped module: its recurring-display schedule
-- (enabled, everyMonths, forWeeks, fromDate) and how many rows each top list shows
-- (topCount). Stored as one JSON object on the singleton content row — a scalar,
-- not its own table, like the music/playtime settings (0007, 0009).
--
-- Nullable, no data migration: a NULL reads back as the default (disabled), so the
-- existing row and a fresh install both work untouched. Disabled by default — the
-- module is opt-in, and appears only inside a scheduled window.
ALTER TABLE site_content ADD COLUMN wrapped TEXT;  -- JSON WrappedSettings; NULL → default
