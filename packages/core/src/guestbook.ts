/**
 * Guestbook — cookieless, pre-moderated (PROJECT.md roadmap). Visitors leave a
 * name + short message; nothing is public until the owner approves it in the CMS
 * queue. Stored data is deliberately minimal (name, message, timestamp) — no IP,
 * no identifier — matching the site's privacy-by-omission stance.
 *
 * This module holds the shared shapes and the pure auto-flag heuristic used to
 * *sort* the moderation queue (it never auto-rejects — a human always decides).
 */

export type GuestbookStatus = "pending" | "approved" | "rejected";

/** A full entry as the CMS sees it (includes moderation metadata). */
export interface GuestbookEntry {
  id: number;
  name: string;
  message: string;
  /** ISO timestamp, server-assigned. */
  createdAt: string;
  status: GuestbookStatus;
  /** Auto-flag reasons, for sorting/triaging the queue. */
  flags: string[];
  /** Auto-flag score — higher means more suspicious. Never auto-acts. */
  score: number;
}

/** What the public site is allowed to see (approved entries only, no metadata). */
export interface PublicGuestbookEntry {
  id: number;
  name: string;
  message: string;
  createdAt: string;
}

export interface ModerationResult {
  score: number;
  flags: string[];
}

/**
 * A short starter list of profane stems — matched as substrings, case-insensitive.
 * Deliberately small and non-slur; it only nudges queue ordering, so precision
 * matters less than keeping the list inoffensive and easy to extend.
 */
const PROFANITY = ["fuck", "shit", "bitch", "asshole", "cunt"];

const URL_RE = /(https?:\/\/|www\.)\S+|\b\S+\.(?:com|net|org|io|ru|xyz|top|cn)\b/gi;

/**
 * Score a submission for spam/abuse signals and return the reasons. Pure and
 * deterministic so it's testable and identical on server + (potentially) client.
 * Higher score = sort earlier in the queue. It never blocks a submission.
 */
export function scoreEntry(name: string, message: string): ModerationResult {
  const flags: string[] = [];
  let score = 0;
  const add = (flag: string, weight: number) => {
    flags.push(flag);
    score += weight;
  };

  const links = message.match(URL_RE)?.length ?? 0;
  if (links > 0) add("links", links >= 2 ? 3 : 1);

  const letters = message.replace(/[^a-zA-Z]/g, "");
  const caps = message.replace(/[^A-Z]/g, "").length;
  if (letters.length >= 12 && caps / letters.length > 0.6) add("caps", 1);

  const trimmed = message.trim();
  if (trimmed.length < 3) add("short", 1);
  if (message.length > 800) add("long", 1);

  if (/(.)\1{6,}/.test(message)) add("repeat", 1); // "aaaaaaaa", "!!!!!!!!"

  const hay = `${name} ${message}`.toLowerCase();
  if (PROFANITY.some((w) => hay.includes(w))) add("profanity", 3);

  return { score, flags };
}
