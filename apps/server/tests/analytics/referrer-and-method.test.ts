import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyHit, type HitInput } from "../../src/analytics/classify.js";

const OWN = "letsgaming.de";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

const hit = (over: Partial<HitInput> = {}): HitInput => ({
  method: "GET",
  path: "/",
  status: 200,
  ua: CHROME,
  ownHost: OWN,
  ...over,
});

test("a plain-http Referer naming the site is a bot, whatever the port or path", () => {
  for (const referrer of [
    "http://letsgaming.de",
    "http://letsgaming.de/",
    "http://letsgaming.de:80/",
    "http://letsgaming.de/wp-json/",
    "http://LetsGaming.de/",
  ]) {
    assert.equal(classifyHit(hit({ referrer })).rule, "referer-self-http", referrer);
  }
});

test("the site's own https Referer is a person (owner, internal navigation, language switch)", () => {
  for (const referrer of ["https://letsgaming.de/", "https://letsgaming.de", "https://letsgaming.de/admin"]) {
    assert.equal(classifyHit(hit({ referrer })).class, "pageview", referrer);
  }
});

test("a plain-http Referer from another site is still a person", () => {
  assert.equal(classifyHit(hit({ referrer: "http://example.com/" })).class, "pageview");
});

test("without an own host the referrer rule stays out of the way", () => {
  const { ownHost: _own, ...noHost } = hit({ referrer: "http://letsgaming.de/" });
  assert.equal(classifyHit(noHost).class, "pageview");
});

test("referrer spam hosts are bots, including their subdomains", () => {
  for (const referrer of ["https://five.co.in/redirect.php?ref_host=letsgaming.de", "https://www.five.co.in/"]) {
    assert.equal(classifyHit(hit({ referrer })).rule, "referer-spam", referrer);
  }
  assert.equal(classifyHit(hit({ referrer: "https://notfive.co.in/" })).class, "pageview");
});

test("write methods to a page or probe path are counted, not dropped", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(classifyHit(hit({ method, path: "/", status: 200 })).rule, "http-post-page", method);
  }
  const post = classifyHit(hit({ method: "POST", path: "/xmlrpc.php", status: 404 }));
  assert.deepEqual([post.class, post.rule], ["probe", "probe-wordpress"]);
  assert.equal(classifyHit(hit({ method: "POST", path: "/?rest_route=/batch/v1" })).rule, "probe-query-wordpress");
  assert.equal(classifyHit(hit({ method: "POST", path: "/", ua: "Go-http-client/2.0" })).family, "Script or tool");
});

test("methods on internal paths, redirects and OPTIONS stay ignored", () => {
  assert.equal(classifyHit(hit({ method: "POST", path: "/api/pulse", status: 204 })).class, "ignored");
  assert.equal(classifyHit(hit({ method: "POST", path: "/admin/pages" })).class, "ignored");
  assert.equal(classifyHit(hit({ method: "POST", path: "/", status: 301 })).class, "ignored");
  assert.equal(classifyHit(hit({ method: "OPTIONS", path: "/" })).class, "ignored");
});

test("a 404 or 410 nothing else claims is a not-found; a bot or probe still wins", () => {
  for (const path of ["/blog/", "/wp/", "/login", "/register", "/livewire/update", "/phpinfo"]) {
    assert.equal(classifyHit(hit({ path, status: 404 })).class, "notfound", path);
  }
  assert.equal(classifyHit(hit({ path: "/gone", status: 410 })).rule, "not-found");
  assert.equal(classifyHit(hit({ path: "/blog/", status: 404, ua: "curl/8.21.0" })).class, "bot");
  assert.equal(classifyHit(hit({ path: "/.env", status: 404 })).class, "probe");
  assert.equal(classifyHit(hit({ path: "/typo", status: 500 })).class, "ignored");
});
