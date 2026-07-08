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

## What you can edit (and what you can't)

Everything on the site that isn't pulled from an API is editable here:

| Tab | Controls |
|---|---|
| **Content** | Identity (name/handle/location/role), the Home **headline**, **lede** (intro text), **status**, and the About **bio** paragraphs. `**bold**` is supported in the lede/bio/now. |
| **Hobbies** | The "Off the clock" tiles (title, blurb, icon, colour). |
| **Links** | Social/contact buttons shown on Home and About. Set an `Icon` from: `gh, mail, x, linkedin, mastodon, youtube, discord, instagram, bluesky, globe`. A link with href `#contact` becomes the "Get in touch" jump. |
| **Now** | The "Right now" rows. |
| **Media** | Upload images (auto-converted to WebP); copy their URLs. |
| **Analytics** | Anonymous aggregates (no cookies, no IPs). |

**Projects and activity are not editable** — they come straight from GitHub. The Projects and
Featured sections show your **pinned repositories first, then your most-recently-updated repos**
(forks and archived repos excluded). To change what appears there, pin/unpin repos on your GitHub
profile or push to them; the site catches up on the next sync (every 6 hours) with no rebuild.

## Adding your social links

1. Go to **Links → + Add link**.
2. Set the label (e.g. "LinkedIn"), the `href` (e.g. `https://linkedin.com/in/you`), and an
   `Icon` key from the list above.
3. Mark one **primary** if you want it emphasised. Save.

For an email button, add a link with href `mailto:you@example.com` and icon `mail`.
