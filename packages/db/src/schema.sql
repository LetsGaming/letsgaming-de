-- letsgaming.de store schema.
--
-- The store is the single source of truth (PROJECT.md §2.2). Two kinds of data
-- live here, kept strictly separate:
--   1. CMS-owned content   — edited by the owner (localized JSON payloads).
--   2. Source-owned data    — synced by adapters, kept as normalized snapshots.
--
-- Localized fields are stored as JSON ({"en": "...", "de": "..."}). List-shaped
-- CMS entities are real tables so CRUD is clean; scalars and the nav tree are
-- single-row JSON documents because they're edited rarely and are naturally nested.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── CMS-owned: singletons ────────────────────────────────────────────────────

-- One row (id = 1). Holds the site scalars, all as localized JSON where relevant.
CREATE TABLE IF NOT EXISTS site_content (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  meta      TEXT NOT NULL,   -- JSON SiteMeta   { name, handle, location, role }
  headline  TEXT NOT NULL,   -- JSON Headline   { before, highlight, after }
  lede      TEXT NOT NULL,   -- JSON Localized
  status    TEXT NOT NULL,   -- JSON Status     { verb, now }
  bio       TEXT NOT NULL    -- JSON Localized[]
);

-- The information architecture, stored as JSON documents (edited rarely).
-- nav = NavNode[]; modules = ModuleDescriptor[]. Keeping the tree intact as JSON
-- means editing a nav label is a content edit, not a schema change.
CREATE TABLE IF NOT EXISTS site_ia (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  nav     TEXT NOT NULL,     -- JSON NavNode[]
  modules TEXT NOT NULL      -- JSON ModuleDescriptor[]
);

-- ── CMS-owned: list entities (CRUD) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tag         TEXT NOT NULL,   -- JSON Localized
  description TEXT NOT NULL,   -- JSON Localized
  meta        TEXT NOT NULL,   -- JSON Localized[]
  href        TEXT NOT NULL,
  featured    INTEGER NOT NULL DEFAULT 0,
  repo        TEXT,            -- optional link to a synced repo by name
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hobbies (
  id    TEXT PRIMARY KEY,
  title TEXT NOT NULL,          -- JSON Localized
  blurb TEXT NOT NULL,          -- JSON Localized
  icon  TEXT,
  tone  TEXT NOT NULL,          -- 'purple' | 'coral' | 'mint' | 'sun'
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS links (
  id       TEXT PRIMARY KEY,
  label    TEXT NOT NULL,       -- JSON Localized
  href     TEXT NOT NULL,
  icon     TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS now_items (
  id    TEXT PRIMARY KEY,
  key   TEXT NOT NULL,          -- JSON Localized
  value TEXT NOT NULL,          -- JSON Localized
  sort  INTEGER NOT NULL DEFAULT 0
);

-- ── Source-owned: the archive + current snapshot ─────────────────────────────

-- Append-only history. Every sync writes one row here. This is what lets the
-- store hold data the public API won't hand you directly over time (§4).
CREATE TABLE IF NOT EXISTS source_snapshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  synced_at TEXT NOT NULL,      -- ISO timestamp
  data      TEXT NOT NULL       -- JSON normalized output
);
CREATE INDEX IF NOT EXISTS idx_snapshots_source_time
  ON source_snapshots (source_id, synced_at DESC);

-- The "current" copy the site reads. One row per source; upserted each sync.
CREATE TABLE IF NOT EXISTS source_current (
  source_id TEXT PRIMARY KEY,
  synced_at TEXT NOT NULL,
  data      TEXT NOT NULL       -- JSON normalized output
);

-- ── Analytics: anonymous aggregates only (§9) ────────────────────────────────
-- Built from parsing the reverse-proxy access log. The IP is dropped at parse
-- time and never stored — only counts per (day, dimension, key). No cookies, no
-- identifiers, nothing personal, so it sits essentially outside GDPR scope.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day       TEXT NOT NULL,       -- YYYY-MM-DD
  dimension TEXT NOT NULL,       -- 'path' | 'referrer' | 'browser' | 'os' | 'device'
  key       TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dimension, key)
);

-- Ingest bookkeeping so re-running the parser doesn't double-count a log file.
CREATE TABLE IF NOT EXISTS analytics_state (
  source TEXT PRIMARY KEY,       -- the log file path
  offset INTEGER NOT NULL DEFAULT 0
);
