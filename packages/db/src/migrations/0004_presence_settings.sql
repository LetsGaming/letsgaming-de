-- Extend presence settings from one axis (what to display) to the full set the
-- CMS now manages: what to *record*, how long to keep it, and which games are
-- hidden from the public chart.
--
-- All three columns are nullable, so the existing single row keeps working
-- untouched — a NULL reads back as "use the default", which for `sample` means
-- "record whatever is displayed" and for retention means "forever". This is why
-- there's no data migration: absence already has the right meaning.
--
-- The `show` column (what the live widget reveals) is unchanged. `sample` is its
-- independent twin: before this, the sampler recorded every category regardless
-- of `show`, so disabling music hid it from the widget while the table kept
-- filling. The two are separate settings because they answer separate questions.
ALTER TABLE site_presence ADD COLUMN sample TEXT;          -- JSON PresenceCategory[]; NULL → default
ALTER TABLE site_presence ADD COLUMN retention_days INTEGER; -- prune older than N days; NULL → forever
ALTER TABLE site_presence ADD COLUMN hidden_games TEXT;     -- JSON string[]; NULL → []
