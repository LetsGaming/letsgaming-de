# Using the CMS

The admin CMS lives at **`/admin`** on the public site — e.g. `https://letsgaming.de/admin`
(locally, `http://localhost:4321/admin`). It's a single-user editor; nothing about it is
linked from the public pages.

## Signing in

Two ways, whichever you configured in `.env`:

- **GitHub OAuth** — click *Sign in with GitHub*. Only the account named in `CMS_ALLOWED_LOGIN`
  (defaults to your `GITHUB_USERNAME`) is allowed in.
- **Bearer token** — paste your `CMS_TOKEN`. Handy for first setup or scripts.

Edits save immediately and appear on the live site with no rebuild.

## Getting around

The admin is a left-hand menu, grouped by job. The **Dashboard** is the landing screen: quick
counts and jump-in links, plus a nudge when guestbook entries are waiting. The top bar has a
**Preview** button and **View site ↗**. A locale switch (EN/DE) in the sidebar controls which
language you're editing — every text field edits the currently-selected locale.

## What you can edit (and what you can't)

Everything on the site that isn't pulled from an API is editable. The menu groups it like this:

| Group | Screen | Controls |
|---|---|---|
| Content | **Site identity** | Name, handle, location, role. |
| Content | **Home intro** | The Home hero: **headline**, **lede**, **status**. `**bold**` works in the lede. |
| Content | **About / bio** | The bio paragraphs (`**bold**` supported). |
| Content | **Hobbies** | The "Off the clock" tiles (title, blurb, icon, colour). |
| Content | **Links** | Social/contact buttons. Icons: `gh, mail, x, linkedin, mastodon, youtube, discord, instagram, bluesky, globe`. A link with href `#contact` becomes the "Get in touch" jump. |
| Content | **Right now** | The "Right now" rows. |
| Structure & media | **Layout** | Reorder modules within an area, move them between areas, or hide them. |
| Structure & media | **Gallery** | Curate the image galleries that appear on the site. |
| Structure & media | **Media** | Upload images (auto-WebP), delete them, or add them to a gallery. |
| Widgets | **Presence** | Which Discord/Steam categories the "Right now-ish" widget may show. |
| Community | **Guestbook** | Approve, reject, or delete visitor entries (nothing is public until you approve it). |
| Insights | **Analytics** | Anonymous traffic + engagement. No cookies, no IPs, nothing personal. |

**Projects and activity are not editable** — they come straight from GitHub. The Projects and
Featured sections show your **pinned repositories first, then your most-recently-updated repos**
(forks and archived repos excluded). To change what appears there, pin/unpin repos on your GitHub
profile or push to them; the site catches up on the next sync (every 6 hours) with no rebuild.

## Rearranging the page (Layout)

Each area (Home, Work, Life, About) renders its modules top-to-bottom. On **Layout** you can:

- Reorder a module within its area with **↑ / ↓**.
- Move a module to a different area — or to **Hidden** to take it off the site — with the dropdown.
- Bring a hidden module back by choosing an area for it.

Then click **Save layout**. One rule: an area must keep at least one module (you can't leave an
area empty). Changes take effect on the next page load.

## Working with images (Media + Gallery)

1. **Media** → *Upload image* (JPEG/PNG/WebP/GIF; it's resized and converted to WebP).
2. On the image, click **+ gallery** to place it into the gallery currently selected on the
   **Gallery** screen. **delete** removes the upload (and any gallery placement of it).
3. On **Gallery**, give each image a **caption** (shown) and optional **alt text** (for screen
   readers; defaults to the caption), and reorder or remove them.
4. Want more than one gallery? **Gallery → + New gallery** creates another one. It starts
   **Hidden** — use **Layout** to drop it into an area. Delete a gallery from the same screen
   (the built-in one can't be deleted; media files are never touched).

## Previewing

**Preview** embeds the live site right in the admin and reloads after each save. Preview traffic
is never counted in analytics. Use **View site ↗** to open the real site in a new tab.

## Adding your social links

1. Go to **Links → + Add link**.
2. Set the label (e.g. "LinkedIn"), the `href` (e.g. `https://linkedin.com/in/you`), and an
   `Icon` key from the list above.
3. Mark one **primary** if you want it emphasised. Save.

For an email button, add a link with href `mailto:you@example.com` and icon `mail`.
