-- 0019_site_ia_revisions: history for the information architecture.
--
-- 0002 archives CMS content into site_content_revisions, but the nav tree and the
-- module registry live in site_ia and were overwritten in place, so a layout or
-- heading edit left nothing to go back to. Each row is the state of site_ia as it
-- stood immediately before a write, archived in the same transaction as that write.

CREATE TABLE IF NOT EXISTS site_ia_revisions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_at TEXT NOT NULL,
  -- What was written: "nav", "modules", "module-added", "module-removed".
  reason   TEXT NOT NULL,
  nav      TEXT NOT NULL,   -- JSON NavNode[] before the write
  modules  TEXT NOT NULL    -- JSON ModuleDescriptor[] before the write
);

CREATE INDEX IF NOT EXISTS idx_ia_revisions_time
  ON site_ia_revisions (saved_at DESC);
