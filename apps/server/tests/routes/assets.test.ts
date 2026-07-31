import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { openStore } from "@lg/db";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";

const TOKEN = "b".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };

async function app(extraEnv: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "lg-assets-"));
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321", MEDIA_DIR: dir, ...extraEnv });
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

/**
 * The CMS's own create-a-post flow, end to end: upload the file, then PATCH the
 * slug that turns a markdown asset into a post at `/md/blog/<name>`.
 *
 * It went the whole way and failed at the last step for months. The PATCH's field
 * whitelist had no `slug`, so it dropped it and answered 200 with the unchanged
 * asset — the post stayed on the slug the *upload* derived from the filename, the
 * panel asked for the one it thought it had set, and the 404 named the reader.
 */
test("assets: a markdown slug is patchable, and the post is served under it", async () => {
  const a = await app();
  const created = (await a.inject({
    method: "POST",
    url: "/api/cms/assets",
    ...multipart("test.md", "text/markdown", Buffer.from("---\ntitle: test\n---\n\nBody")),
  })).json();
  assert.equal(created.slug, "test"); // derived from the filename at upload

  const patched = await a.inject({
    method: "PATCH",
    url: `/api/cms/assets/${created.id}`,
    headers: auth,
    payload: { slug: "blog/test", title: "test" },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().slug, "blog/test"); // the response is the stored asset

  // The slug is a path, and the /md route takes it percent-encoded.
  const raw = await a.inject({ method: "GET", url: `/api/assets/md/${encodeURIComponent("blog/test")}` });
  assert.equal(raw.statusCode, 200);
  assert.match(raw.json().markdown, /Body/);
  // …and nothing answers on the old one.
  assert.equal((await a.inject({ method: "GET", url: "/api/assets/md/test" })).statusCode, 404);
  await a.close();
});

test("assets: a slug another post owns is a conflict; keeping your own is not", async () => {
  const a = await app();
  const md = (name: string, body: string) =>
    a.inject({ method: "POST", url: "/api/cms/assets", ...multipart(name, "text/markdown", Buffer.from(body)) });
  const one = (await md("one.md", "# One")).json();
  const two = (await md("two.md", "# Two")).json();

  const patch = (id: string, slug: string) =>
    a.inject({ method: "PATCH", url: `/api/cms/assets/${id}`, headers: auth, payload: { slug } });

  assert.equal((await patch(one.id, "blog/post")).statusCode, 200);
  // Taken — refused, rather than silently suffixed onto blog/post-2 (an explicit
  // rename that lands somewhere else is the bug we just fixed, wearing a hat).
  assert.equal((await patch(two.id, "blog/post")).statusCode, 409);
  // Re-saving a post under the slug it already owns isn't a collision with itself.
  assert.equal((await patch(one.id, "blog/post")).statusCode, 200);
  // Non-canonical input is normalized the same way the upload path does it.
  assert.equal((await patch(two.id, "Blog/My Post!")).json().slug, "blog/my-post");
  // Only markdown has a slug at all.
  const png_ = (await a.inject({ method: "POST", url: "/api/cms/assets", ...multipart("p.png", "image/png", await png()) })).json();
  assert.equal((await patch(png_.id, "blog/nope")).statusCode, 400);
  await a.close();
});

/**
 * The editor reads its own drafts.
 *
 * It used to read the public `/md/<slug>` route, which 404s a draft without a
 * preview token — and the CMS has never held one. Since every new post is born a
 * draft, the editor could only open posts that no longer needed editing.
 */
test("assets: the CMS reads a draft's source by id, the public path still won't", async () => {
  const a = await app({ PREVIEW_SECRET: "s".repeat(32) });
  const draft = (await a.inject({
    method: "POST",
    url: "/api/cms/assets",
    ...multipart("secret.md", "text/markdown", Buffer.from("---\ntitle: Secret\ndraft: true\n---\n\nWIP")),
  })).json();

  const src = await a.inject({ method: "GET", url: `/api/cms/assets/${draft.id}/content`, headers: auth });
  assert.equal(src.statusCode, 200);
  assert.match(src.json().markdown, /WIP/);

  // Authed route: no session, no source.
  assert.equal((await a.inject({ method: "GET", url: `/api/cms/assets/${draft.id}/content` })).statusCode, 401);

  // The public path is exactly as strict as it was — 404 bare, readable with the
  // token the CMS route just handed the editor for its Preview link.
  const url = `/api/assets/md/${encodeURIComponent(draft.slug)}`;
  assert.equal((await a.inject({ method: "GET", url })).statusCode, 404);
  const previewed = await a.inject({ method: "GET", url: `${url}?preview=${src.json().previewToken}` });
  assert.equal(previewed.statusCode, 200);
  assert.equal(previewed.headers["cache-control"], "private, no-store");
  await a.close();
});
