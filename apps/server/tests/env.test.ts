import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_SESSION_SECRET, loadEnv } from "../src/env.js";

const STRONG = "a".repeat(40);

test("refuses to boot when OAuth is enabled but SESSION_SECRET is unset (SEC-01)", () => {
  assert.throws(
    () => loadEnv({ GITHUB_OAUTH_CLIENT_ID: "cid", GITHUB_OAUTH_CLIENT_SECRET: "sec" }),
    /SESSION_SECRET must be set/,
  );
});

test("empty-string SESSION_SECRET is treated as unset, not accepted (BUG-02)", () => {
  assert.throws(
    () => loadEnv({ GITHUB_OAUTH_CLIENT_ID: "cid", SESSION_SECRET: "   " }),
    /SESSION_SECRET must be set/,
  );
});

test("the shipped dev default is rejected when the CMS is enabled", () => {
  assert.throws(
    () => loadEnv({ CMS_TOKEN: "t", SESSION_SECRET: DEV_SESSION_SECRET }),
    /SESSION_SECRET must be set/,
  );
});

test("boots when the CMS is enabled and a real secret is provided", () => {
  const env = loadEnv({ GITHUB_OAUTH_CLIENT_ID: "cid", SESSION_SECRET: STRONG });
  assert.equal(env.sessionSecret, STRONG);
});

test("a bearer token doubles as the signing secret (non-default) and boots", () => {
  const env = loadEnv({ CMS_TOKEN: STRONG });
  assert.equal(env.sessionSecret, STRONG);
});

test("with no CMS configured, boot succeeds and stays fully public", () => {
  const env = loadEnv({});
  assert.equal(env.cmsToken, undefined);
  assert.equal(env.oauth.clientId, undefined);
});
