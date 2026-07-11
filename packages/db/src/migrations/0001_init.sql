-- 0001_init — baseline schema for letsgaming.de.
-- Idempotent (CREATE TABLE IF NOT EXISTS): safe on a fresh DB (creates everything)
-- and on a pre-migrations DB adopting this runner (no-ops existing tables).
-- Connection pragmas live in openDatabase(), not here.

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

-- CMS-owned presence config (which Discord/Steam categories the widget reveals).
-- One row (id = 1); a JSON string[] of enabled category keys. The Discord id and
-- Steam credentials stay in env — only the curation lives here.
CREATE TABLE IF NOT EXISTS site_presence (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  show TEXT NOT NULL           -- JSON PresenceCategory[]
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

-- Asset library (media manager): a central, reusable set of files referenced
-- from anywhere by id. Identity is the content hash (dedupe: one row per file).
CREATE TABLE IF NOT EXISTS asset_folders (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id TEXT REFERENCES asset_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  hash        TEXT NOT NULL UNIQUE,   -- sha256 of original bytes (dedupe key)
  kind        TEXT NOT NULL,          -- image | svg | gif | pdf | markdown | file
  ext         TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  slug        TEXT UNIQUE,            -- markdown page slug (/md/<slug>); null otherwise
  filename    TEXT NOT NULL,
  alt         TEXT,
  title       TEXT,
  caption     TEXT,
  description TEXT,
  folder_id   TEXT REFERENCES asset_folders(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);

-- Cached derived renditions of image assets (one width in one format).
CREATE TABLE IF NOT EXISTS asset_variants (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  format   TEXT NOT NULL,          -- webp | avif
  width    INTEGER NOT NULL,
  bytes    INTEGER NOT NULL,
  PRIMARY KEY (asset_id, format, width)
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);

-- Where each asset is referenced, so the CMS can show "used in" and warn on delete.
CREATE TABLE IF NOT EXISTS asset_usages (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  context  TEXT NOT NULL,          -- e.g. gallery:travel, hero, link:github, md:about
  label    TEXT,
  PRIMARY KEY (asset_id, context)
);
CREATE INDEX IF NOT EXISTS idx_asset_usages_ctx ON asset_usages(context);

-- Images placed on the site via the CMS. Each references a library asset.
-- `module` groups images by which gallery module they belong to (multiple galleries).
CREATE TABLE IF NOT EXISTS gallery (
  id      TEXT PRIMARY KEY,
  module  TEXT NOT NULL DEFAULT 'gallery',  -- owning gallery module id
  asset   TEXT NOT NULL,        -- reference to an asset, "asset:<id>"
  caption TEXT NOT NULL,        -- JSON Localized
  sort    INTEGER NOT NULL DEFAULT 0
);

-- ── Visitor-submitted: guestbook (pre-moderated) ─────────────────────────────
-- Cookieless, minimal: name + message + server timestamp only (no IP, no id).
-- Nothing is public until `status = 'approved'` in the CMS queue. `flags`/`score`
-- are auto-computed hints that only *sort* the queue — a human always decides.
CREATE TABLE IF NOT EXISTS guestbook (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL,                      -- ISO timestamp (server-assigned)
  status     TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'approved' | 'rejected'
  flags      TEXT NOT NULL DEFAULT '',           -- comma-joined auto-flag reasons
  score      INTEGER NOT NULL DEFAULT 0          -- auto-flag score (higher = suspicious)
);
CREATE INDEX IF NOT EXISTS idx_guestbook_status ON guestbook (status, created_at DESC);

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

-- Engagement events (cookieless beacon), bucketed by UTC hour so the dashboard
-- can show hourly resolution and clear by fine-grained time ranges.
CREATE TABLE IF NOT EXISTS analytics_hourly (
  bucket    TEXT NOT NULL,       -- YYYY-MM-DDTHH (UTC)
  dimension TEXT NOT NULL,       -- 'tab' | 'transition' | 'dwell' | 'click' | ...
  key       TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, dimension, key)
);
CREATE INDEX IF NOT EXISTS idx_analytics_hourly_dim ON analytics_hourly (dimension, bucket);

-- Ingest bookkeeping so re-running the parser doesn't double-count a log file.
CREATE TABLE IF NOT EXISTS analytics_state (
  source TEXT PRIMARY KEY,       -- the log file path
  offset INTEGER NOT NULL DEFAULT 0
);
