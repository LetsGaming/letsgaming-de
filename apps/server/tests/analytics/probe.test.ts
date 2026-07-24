import assert from "node:assert/strict";
import { test } from "node:test";
import { PROBE_FAMILY, probeFamily } from "../../src/analytics/probe.js";

/**
 * Every path in this suite is one that actually appeared in the live dashboard's
 * Top paths, counted as a page view from "Chrome on Windows". They're the reason
 * this classifier exists.
 */
test("the real scanner traffic from the dashboard is classified, not counted as people", () => {
  const seen: [string, string][] = [
    ["/wp-json/", PROBE_FAMILY.wordpress],
    ["/wp-content/themes/pridmag/db.php", PROBE_FAMILY.wordpress],
    ["/.env", PROBE_FAMILY.secrets],
    ["/config.php", PROBE_FAMILY.php],
    ["/db.php", PROBE_FAMILY.php],
    ["/info.php", PROBE_FAMILY.php],
    ["/index.php", PROBE_FAMILY.php],
    ["/functions.php", PROBE_FAMILY.php],
    ["/wso.php", PROBE_FAMILY.shell],
    ["/xx.php", PROBE_FAMILY.php],
    ["/xp.php", PROBE_FAMILY.php],
    ["/x.php", PROBE_FAMILY.php],
    ["/zwso.php", PROBE_FAMILY.php],
    ["/xl2023.php", PROBE_FAMILY.php],
    ["/xex.php", PROBE_FAMILY.php],
    ["/wsax.php", PROBE_FAMILY.php],
    ["/wsad.php", PROBE_FAMILY.php],
    ["/wsa.php", PROBE_FAMILY.php],
  ];
  for (const [path, family] of seen) {
    assert.equal(probeFamily(path), family, `${path} should be ${family}`);
  }
});

test("real site paths are never classified as probes", () => {
  for (const path of [
    "/",
    "/work",
    "/life",
    "/about",
    "/blog",
    "/md/blog/hello-world",
    "/docs/readme",
    "/datenschutz",
    // Has a dot but is a legitimate page, and must not trip the dotfile rule.
    "/.well-known/security.txt",
  ]) {
    assert.equal(probeFamily(path), null, `${path} must not be a probe`);
  }
});

test("more specific families win over the generic PHP rule", () => {
  assert.equal(probeFamily("/wp-login.php"), PROBE_FAMILY.wordpress);
  assert.equal(probeFamily("/phpmyadmin/index.php"), PROBE_FAMILY.admin);
  assert.equal(probeFamily("/alfa.php"), PROBE_FAMILY.shell);
  // …and a plain one still lands in PHP.
  assert.equal(probeFamily("/random.php"), PROBE_FAMILY.php);
});

test("backup and dump hunting is its own family", () => {
  assert.equal(probeFamily("/backup.sql"), PROBE_FAMILY.backup);
  assert.equal(probeFamily("/db.sql.gz".replace(".gz", "")), PROBE_FAMILY.backup);
  assert.equal(probeFamily("/site.zip"), PROBE_FAMILY.backup);
  assert.equal(probeFamily("/backups/"), PROBE_FAMILY.backup);
});

test("path traversal is always a probe", () => {
  assert.equal(probeFamily("/static/..%2f..%2fetc/passwd"), PROBE_FAMILY.shell);
  assert.equal(probeFamily("/a/../../etc/passwd"), PROBE_FAMILY.shell);
});

test("secrets and version-control leaks are caught", () => {
  assert.equal(probeFamily("/.git/config"), PROBE_FAMILY.secrets);
  assert.equal(probeFamily("/.aws/credentials"), PROBE_FAMILY.secrets);
  assert.equal(probeFamily("/.env.production"), PROBE_FAMILY.secrets);
});

test("the root is never a probe, and neither is an empty path", () => {
  assert.equal(probeFamily("/"), null);
  assert.equal(probeFamily(""), null);
});

test("a trailing %20 does not smuggle a probe past the extension match", () => {
  // A scanner evasion, and it worked: these sat in the live dashboard's Top
  // paths as human page views while their unsuffixed twins were classified.
  assert.equal(probeFamily("/xp.php%20"), PROBE_FAMILY.php);
  assert.equal(probeFamily("/wp-header.php%20"), PROBE_FAMILY.php);
  assert.equal(probeFamily("/fm.php%20"), PROBE_FAMILY.php);
  assert.equal(probeFamily("/wp-content/themes/twentytwentyfour/system_cache.php%20"), PROBE_FAMILY.wordpress);
  // A literal trailing space, for a proxy that decoded it already.
  assert.equal(probeFamily("/admin.php "), PROBE_FAMILY.php);
});

test("malformed percent-encoding is judged, not thrown on", () => {
  // `decodeURIComponent` throws on a lone %; a scanner will send one.
  assert.equal(probeFamily("/wp-login.php%"), PROBE_FAMILY.wordpress);
  assert.doesNotThrow(() => probeFamily("/%"));
  assert.equal(probeFamily("/%"), null);
});

test("encoded traversal is still caught after decoding", () => {
  assert.equal(probeFamily("/a/..%2f..%2fetc/passwd"), PROBE_FAMILY.shell);
});

test("a real path with an encoded space is still a real path", () => {
  assert.equal(probeFamily("/md/blog/hello%20world"), null);
});
