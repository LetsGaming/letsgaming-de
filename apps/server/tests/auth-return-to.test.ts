import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { openStore } from "@lg/db";
import { safeReturnTo } from "../src/auth/return-to.js";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ORIGIN = "http://localhost:4321";

async function oauthApp() {
  const env = loadEnv({
    WEB_ORIGIN: ORIGIN,
    SESSION_SECRET: "test-secret-test-secret-test-secret",
    GITHUB_OAUTH_CLIENT_ID: "cid",
    GITHUB_OAUTH_CLIENT_SECRET: "csecret",
    CMS_ALLOWED_LOGIN: "owner",
  });
  return buildApp(openStore(":memory:"), env);
}

function stubGithub(login: string) {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("access_token")) return Response.json({ access_token: "tok" });
    if (url.includes("api.github.com/user")) return Response.json({ login });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

/** Runs login then callback, returning the final redirect Location. */
async function roundTrip(returnTo?: string): Promise<string> {
  const app = await oauthApp();
  try {
    stubGithub("owner");
    const qs = returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
    const login = await app.inject({ method: "GET", url: `/auth/github/login${qs}` });
    assert.equal(login.statusCode, 302);
    const state = new URL(String(login.headers.location)).searchParams.get("state");
    assert.ok(state);
    const stateCookie = login.cookies.find((c) => c.name === "lg_oauth_state");
    assert.ok(stateCookie);
    const cb = await app.inject({
      method: "GET",
      url: `/auth/github/callback?code=abc&state=${state}`,
      cookies: { lg_oauth_state: stateCookie.value },
    });
    assert.equal(cb.statusCode, 302);
    return String(cb.headers.location);
  } finally {
    await app.close();
  }
}

test("oauth login without returnTo lands on /admin", async () => {
  assert.equal(await roundTrip(), `${ORIGIN}/admin`);
});

test("oauth login preserves /admin/analytics, query and hash", async () => {
  assert.equal(await roundTrip("/admin/analytics"), `${ORIGIN}/admin/analytics`);
  assert.equal(await roundTrip("/admin?tab=x#editor"), `${ORIGIN}/admin?tab=x#editor`);
});

test("oauth login rejects open-redirect returnTo values", async () => {
  for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "evil.example"]) {
    assert.equal(await roundTrip(bad), `${ORIGIN}/admin`, bad);
  }
});

test("oauth callback with a mismatched state is refused", async () => {
  const app = await oauthApp();
  const login = await app.inject({ method: "GET", url: "/auth/github/login?returnTo=/admin" });
  const stateCookie = login.cookies.find((c) => c.name === "lg_oauth_state");
  assert.ok(stateCookie);
  const cb = await app.inject({
    method: "GET",
    url: "/auth/github/callback?code=abc&state=wrong",
    cookies: { lg_oauth_state: stateCookie.value },
  });
  assert.equal(cb.statusCode, 400);
  await app.close();
});

test("dev login honours a safe returnTo and rejects unsafe ones", async () => {
  const app = await buildApp(openStore(":memory:"), loadEnv({ WEB_ORIGIN: ORIGIN }));
  const ok = await app.inject({ method: "GET", url: "/auth/dev/login?returnTo=%2Fadmin%2Fanalytics" });
  assert.equal(ok.headers.location, `${ORIGIN}/admin/analytics`);
  const bad = await app.inject({ method: "GET", url: "/auth/dev/login?returnTo=%2F%2Fevil.example" });
  assert.equal(bad.headers.location, `${ORIGIN}/admin`);
  await app.close();
});

test("safeReturnTo accepts only single-slash relative paths", () => {
  assert.equal(safeReturnTo("/admin/x"), "/admin/x");
  assert.equal(safeReturnTo(undefined), "/admin");
  assert.equal(safeReturnTo("//evil"), "/admin");
  assert.equal(safeReturnTo("/\\evil"), "/admin");
  assert.equal(safeReturnTo("/ok\r\nSet-Cookie: x"), "/admin");
});
