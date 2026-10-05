#!/usr/bin/env tsx
/**
 * `pnpm sync:game-images [--retry-misses]` — look up Discord images for games now
 * instead of waiting for the next scheduled sweep, and show what each game has.
 *
 * `--retry-misses` first forgets recorded "no image" answers so those games are
 * looked up again straight away; games that already have an image are untouched.
 *
 * A game only appears here once it has been seen running while its category is on
 * the record list, because that is when its Discord application is recorded.
 */
import { openStore } from "@lg/db";
import { loadEnv } from "../env.js";
import { resolveGameImages } from "./game-images.js";

const env = loadEnv();
const store = openStore(env.dbPath);

if (process.argv.includes("--retry-misses")) {
  console.log(`Reset ${store.gameMeta.resetMisses()} recorded miss(es).`);
}

if (store.gameMeta.imageRows().length === 0) {
  console.log("No game has a recorded Discord application yet. Start a game and wait for the next presence poll (every 5 minutes).");
}

const resolved = await resolveGameImages(store, console.log);
console.log(`Resolved ${resolved} image(s) this run.`);

for (const r of store.gameMeta.imageRows()) {
  const state = r.imageUrl ? "image" : r.checkedAt ? `no image (checked ${r.checkedAt})` : "pending";
  console.log(`${r.name}  application=${r.applicationId ?? "-"}  ${state}${r.imageUrl ? `  ${r.imageUrl}` : ""}`);
}

store.close();
