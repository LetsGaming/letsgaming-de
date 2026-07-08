import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { openStore } from "@lg/db";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";

const TOKEN = "b".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };

async function app() {
  const dir = await mkdtemp(join(tmpdir(), "lg-assets-"));
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321", MEDIA_DIR: dir });
  return buildApp(openStore(":memory:"), env);
}

/** Build a multipart/form-data body with a single `file` part. */
function multipart(filename: string, contentType: string, data: Buffer) {
  const boundary = "----lgtest" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const png = () =>
  sharp({ create: { width: 20, height: 12, channels: 3, background: "#c33" } }).png().toBuffer();

test("assets upload: stores, reads back dimensions, and de-dupes identical bytes", async () => {
  const a = await app();
  const buf = await png();
  const up = await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("photo.png", "image/png", buf) });
  assert.equal(up.statusCode, 200);
  const asset = up.json();
  assert.equal(asset.kind, "image");
  assert.equal(asset.width, 20);
  assert.equal(asset.height, 12);

  // Same bytes again → same asset id, still one row.
  const up2 = await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("copy.png", "image/png", buf) });
  assert.equal(up2.json().id, asset.id);
  const list = await a.inject({ method: "GET", url: "/api/cms/assets", headers: auth });
  assert.equal(list.json().assets.length, 1);
  await a.close();
});

test("assets serving: original + lazily generated WebP variant", async () => {
  const a = await app();
  const asset = (await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("p.png", "image/png", await png()) })).json();

  const orig = await a.inject({ method: "GET", url: `/assets/${asset.id}` });
  assert.equal(orig.statusCode, 200);
  assert.equal(orig.headers["content-type"], "image/png");

  const v = await a.inject({ method: "GET", url: `/assets/${asset.id}/w640.webp` });
  assert.equal(v.statusCode, 200);
  assert.equal(v.headers["content-type"], "image/webp");
  // The variant is now recorded (cached).
  const detail = await a.inject({ method: "GET", url: `/api/cms/assets/${asset.id}`, headers: auth });
  assert.ok(detail.json().variants.some((x: { width: number; format: string }) => x.width === 640 && x.format === "webp"));

  // A width outside the fixed menu is rejected.
  assert.equal((await a.inject({ method: "GET", url: `/assets/${asset.id}/w999.webp` })).statusCode, 400);
  await a.close();
});

test("assets: SVG is sanitized before storage (no script survives)", async () => {
  const a = await app();
  const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h24v24H0z" onload="x()"/></svg>';
  const asset = (await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("i.svg", "image/svg+xml", Buffer.from(evil)) })).json();
  assert.equal(asset.kind, "svg");
  const served = await a.inject({ method: "GET", url: `/assets/${asset.id}` });
  assert.equal(served.headers["content-type"], "image/svg+xml");
  assert.ok(!served.body.includes("<script"));
  assert.ok(!/onload=/i.test(served.body));
  assert.ok(served.body.includes("<path")); // real content kept
  await a.close();
});

test("assets: markdown gets a slug and serves raw for the /md page", async () => {
  const a = await app();
  const asset = (await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("My Notes.md", "text/markdown", Buffer.from("# Hello\n\nBody")) })).json();
  assert.equal(asset.kind, "markdown");
  assert.equal(asset.slug, "my-notes");
  const raw = await a.inject({ method: "GET", url: `/api/assets/md/${asset.slug}` });
  assert.equal(raw.statusCode, 200);
  assert.match(raw.json().markdown, /# Hello/);
  // Hitting the asset id redirects to the /md page.
  const red = await a.inject({ method: "GET", url: `/assets/${asset.id}` });
  assert.equal(red.statusCode, 302);
  assert.equal(red.headers.location, "/md/my-notes");
  await a.close();
});

test("assets: metadata patch, folders, and delete", async () => {
  const a = await app();
  const asset = (await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("p.png", "image/png", await png()) })).json();

  const folder = (await a.inject({ method: "POST", url: "/api/cms/assets/folders", headers: auth, payload: { name: "Trips" } })).json();
  const patched = await a.inject({
    method: "PATCH",
    url: `/api/cms/assets/${asset.id}`,
    headers: auth,
    payload: { alt: "A red square", title: "Square", folderId: folder.id, tags: ["test", "shapes"] },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().alt, "A red square");
  assert.equal(patched.json().folderId, folder.id);
  assert.deepEqual(patched.json().tags, ["shapes", "test"]);

  // Filter by the new folder + tag.
  assert.equal((await a.inject({ method: "GET", url: `/api/cms/assets?folder=${folder.id}`, headers: auth })).json().assets.length, 1);
  assert.equal((await a.inject({ method: "GET", url: "/api/cms/assets?tag=shapes", headers: auth })).json().assets.length, 1);

  const del = await a.inject({ method: "DELETE", url: `/api/cms/assets/${asset.id}`, headers: auth });
  assert.equal(del.statusCode, 200);
  assert.equal((await a.inject({ method: "GET", url: `/assets/${asset.id}` })).statusCode, 404);
  await a.close();
});
