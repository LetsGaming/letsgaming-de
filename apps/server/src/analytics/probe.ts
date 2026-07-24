/**
 * Is this request an attack probe?
 *
 * `agent.ts` asks whether a request *admits* to being a program. This asks a
 * different question — whether what it asked for could plausibly have been asked
 * for by a person on this site — and it catches the traffic `agent.ts` cannot,
 * because scanners lie about their user agent. A vulnerability scanner sends
 * `Mozilla/5.0 … Chrome/120`, so it lands in "Chrome / Windows / desktop" and its
 * requests land in Top paths, and a dashboard reporting 1,361 page views is
 * really reporting about forty.
 *
 * The signal here is unusually clean because it's specific to this codebase: this
 * site is a Nuxt application with no PHP, no WordPress and no CGI anywhere in it.
 * A request for `/wp-content/themes/pridmag/db.php` or `/wso.php` is not a person
 * who mistyped — those paths have never existed here, and the only software that
 * asks for them is looking for a known exploit. That makes this a statement about
 * *this* server's routes, not a guess about intent.
 *
 * Same privacy ceiling as `agent.ts`: this reads a path, classifies it into a
 * coarse family, and keeps the family. Nothing is retained that could link two
 * requests to each other.
 *
 * Probes are counted, not dropped — a scan burst is worth seeing, and it's the
 * single most useful thing in the log for knowing you're being enumerated. They
 * just don't belong in `path`, `browser`, `os`, `device` or `referrer`, which
 * exist to describe people.
 */

/** Coarse probe family. Grouped by what the scanner was hoping to find. */
export const PROBE_FAMILY = {
  wordpress: "WordPress probe",
  php: "PHP probe",
  secrets: "Secret / config file",
  admin: "Admin panel probe",
  backup: "Backup / dump hunt",
  shell: "Shell / RCE probe",
  other: "Other probe",
} as const;

export type ProbeFamily = (typeof PROBE_FAMILY)[keyof typeof PROBE_FAMILY];

/**
 * Ordered rules — first match wins, so the specific ones come before the general.
 * `/wp-login.php` is a WordPress probe rather than a generic PHP one, and
 * `/phpmyadmin/index.php` is an admin-panel probe rather than either.
 */
const RULES: { family: ProbeFamily; test: RegExp }[] = [
  // Panel software, before the generic .php rule catches their index files.
  { family: PROBE_FAMILY.admin, test: /\/(phpmyadmin|pma|myadmin|adminer|dbadmin|mysqladmin|manager\/html)(\/|$)/i },

  // WordPress, by far the loudest family on any site that isn't WordPress.
  { family: PROBE_FAMILY.wordpress, test: /\/(wp-admin|wp-content|wp-includes|wp-json|wp-login\.php|wp-config|xmlrpc\.php|wlwmanifest\.xml)/i },

  // Credentials and version control left in a web root.
  { family: PROBE_FAMILY.secrets, test: /\/\.(env|git|svn|hg|aws|ssh|npmrc|htpasswd|DS_Store|vscode|idea)(\/|$|\.)/i },
  { family: PROBE_FAMILY.secrets, test: /\/(credentials|secrets?|id_rsa|\.env\.[a-z]+|config\.(json|ya?ml|ini))$/i },

  // Someone else's database, hopefully left lying around.
  { family: PROBE_FAMILY.backup, test: /\.(sql|bak|old|swp|zip|tar|tgz|tar\.gz|7z|rar|dump)$/i },
  { family: PROBE_FAMILY.backup, test: /\/(backup|backups|dump|db_backup)(\/|$)/i },

  // Remote execution: CGI, appliance endpoints, and the classic webshell names.
  { family: PROBE_FAMILY.shell, test: /\/(cgi-bin|boaform|goform|shell|cmd|console|actuator|solr|jenkins|struts|hudson|jmx-console)(\/|$)/i },
  { family: PROBE_FAMILY.shell, test: /\/(wso|alfa|r57|c99|indoxploit|mini|marijuana|priv8|bypass|shell\d*)\.php$/i },
  // `..%2f`, `..%5c` and friends — always an attack, never a browser.
  { family: PROBE_FAMILY.shell, test: /(\.\.(%2f|%5c|\/|\\)){1,}/i },

  // Anything else server-side that this site simply doesn't run.
  { family: PROBE_FAMILY.php, test: /\.(php\d?|phtml|asp|aspx|jsp|jspx|cfm|cgi|pl)($|\/)/i },

  // Generic scanner furniture.
  { family: PROBE_FAMILY.other, test: /\/(vendor\/phpunit|eval-stdin|telescope\/requests|\.well-known\/traffic-advice|autodiscover\/autodiscover\.xml)/i },
];

/**
 * Percent-decode and strip trailing junk, without throwing on malformed input.
 *
 * Scanners append `%20` — an encoded space — precisely to defeat extension
 * matching: `/xp.php%20` requests the same file as `/xp.php` on a sloppy server,
 * but `.php` is no longer at the end of the string. The live dashboard had a
 * column of them (`/xp.php%20`, `/wp-header.php%20`, `/fm.php%20`) sitting in Top
 * paths as human page views while their unsuffixed twins were correctly filed as
 * probes.
 *
 * `decodeURIComponent` throws on a lone `%`, which a scanner will also send, so
 * a failed decode falls back to the raw string rather than taking the request
 * down.
 */
function normalizePath(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed encoding: judge what was actually sent.
  }
  // Trailing spaces, dots and slashes are all "same file, different string" on
  // the servers these scans are written for.
  return decoded.replace(/[\s.]+$/, "");
}

/**
 * The probe family for a request path, or `null` if it looks like a real request.
 *
 * Takes the path only — never the query, never the agent. A false positive here
 * loses a page view from the count; a false negative leaves scanner noise in the
 * human-facing dimensions. The rules are therefore written to match things that
 * cannot exist on this site rather than things that merely look suspicious.
 *
 * Matched against both the raw and the normalized form: normalizing catches the
 * `%20` evasion, and keeping the raw catches the traversal patterns that only
 * exist *because* they're encoded (`..%2f`).
 */
export function probeFamily(path: string): ProbeFamily | null {
  if (!path || path === "/") return null;
  const normalized = normalizePath(path);
  if (!normalized || normalized === "/") return null;
  for (const rule of RULES) {
    if (rule.test.test(path) || rule.test.test(normalized)) return rule.family;
  }
  return null;
}
