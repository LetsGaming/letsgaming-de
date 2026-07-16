import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidPreviewToken, previewToken } from "../src/preview.js";

test("previewToken: derived, stable, slug-bound, revocable", () => {
  const secret = "s3cret";
  const a = previewToken("post-a", secret);
  assert.equal(a, previewToken("post-a", secret), "stable for a given slug+secret");
  assert.notEqual(a, previewToken("post-b", secret), "a link to one draft doesn't open another");
  assert.notEqual(a, previewToken("post-a", "rotated"), "rotating the secret revokes every link");
  assert.equal(a.length, 24);
});

test("isValidPreviewToken: fails closed", () => {
  const secret = "s3cret";
  assert.equal(isValidPreviewToken("p", secret, previewToken("p", secret)), true);
  assert.equal(isValidPreviewToken("p", secret, "wrong"), false);
  assert.equal(isValidPreviewToken("p", secret, undefined), false);
  // No secret configured means no previews — never "every draft is public".
  assert.equal(isValidPreviewToken("p", undefined, previewToken("p", secret)), false);
});
