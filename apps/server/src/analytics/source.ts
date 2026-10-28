import { DIRECT_REFERRER, UTM_PREFIX } from "@lg/core";

export type SourceCategory = "search" | "social" | "campaign" | "referral" | "direct";

/**
 * Registrable-domain labels by category. A host matches on its registrable
 * label, so `www.google.de`, `out.reddit.com` and `l.facebook.com` all resolve,
 * while `reddit.example.com` does not.
 */
const SOURCE_LABELS: Record<Exclude<SourceCategory, "campaign" | "referral" | "direct">, readonly string[]> = {
  search: ["google", "bing", "duckduckgo", "ecosia", "brave", "yahoo", "startpage", "qwant", "yandex", "baidu", "kagi"],
  social: [
    "reddit", "x", "twitter", "facebook", "instagram", "youtube", "youtu", "twitch", "discord", "discordapp",
    "linkedin", "lnkd", "mastodon", "bsky", "threads", "tiktok", "telegram", "whatsapp",
  ],
};

const SOCIAL_HOSTS = new Set(["t.co"]);
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac"]);

function registrableLabel(host: string): string {
  const labels = host.toLowerCase().replace(/:\d+$/, "").split(".");
  if (labels.length < 2) return labels[0] ?? "";
  const second = labels[labels.length - 2]!;
  if (SECOND_LEVEL.has(second) && labels.length >= 3) return labels[labels.length - 3]!;
  return second;
}

function categoryOfLabel(label: string): "search" | "social" | null {
  if (SOURCE_LABELS.search.includes(label)) return "search";
  if (SOURCE_LABELS.social.includes(label)) return "social";
  return null;
}

/**
 * Category for a stored `referrer` value: a host, a `utm:<tag>` value, or null
 * when no referrer row was written (own host, or nothing usable).
 */
export function sourceOf(referrer: string | null | undefined): SourceCategory {
  if (!referrer || referrer === DIRECT_REFERRER) return "direct";
  if (referrer.startsWith(UTM_PREFIX)) {
    const tag = referrer.slice(UTM_PREFIX.length).toLowerCase();
    if (SOCIAL_HOSTS.has(tag)) return "social";
    return categoryOfLabel(tag) ?? categoryOfLabel(registrableLabel(tag)) ?? "campaign";
  }
  const host = referrer.toLowerCase().replace(/:\d+$/, "");
  if (SOCIAL_HOSTS.has(host)) return "social";
  return categoryOfLabel(registrableLabel(host)) ?? "referral";
}
