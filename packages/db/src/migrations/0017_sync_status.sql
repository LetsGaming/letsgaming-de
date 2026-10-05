-- Last success and last failure per background job (sources, presence sampler,
-- metadata sweeps). `last_success_at` only moves forward on a success and
-- `last_error` is cleared by one, so a non-null `last_error` means the most
-- recent attempt failed.
CREATE TABLE IF NOT EXISTS sync_status (
  source TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error TEXT
);
