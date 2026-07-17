-- 0002_content_revisions — append-only history for CMS-owned content.
--
-- 0001 archives every sync into `source_snapshots` because "history can't be
-- re-fetched", then stores everything the owner writes in `site_content` as a
-- single row under `CHECK (id = 1)` and UPDATEs it in place. So GitHub's commit
-- list — which GitHub would hand back tomorrow — is kept forever, and a rewritten
-- bio is gone the moment the field blurs. The CMS saves on blur, so that isn't
-- hypothetical: it's every edit.
--
-- This is the same pair 0001 already uses for sources, applied to the owner:
--
--   source_current      ←→  site_content              (the fast current copy)
--   source_snapshots    ←→  site_content_revisions    (the archive)
--
-- Cheap: the whole document is ~13KB of JSON and it changes a few times a day.
-- The archive is what must be backed up (§10) — now it holds the half that
-- genuinely can't be re-fetched from anywhere.

CREATE TABLE IF NOT EXISTS site_content_revisions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_at TEXT NOT NULL,      -- ISO timestamp
  -- What changed, for the history list: "bio", "hobbies", "restore", …
  reason   TEXT NOT NULL,
  -- JSON SiteContent — the whole document as it stood *after* this write, so the
  -- newest row is always the current state and restoring is one write, not a
  -- replay. Same shape as source_snapshots.data for the same reason.
  content  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_revisions_time
  ON site_content_revisions (saved_at DESC);
