# Using the CMS

The admin CMS is at `/admin` on the public site (for example
`https://letsgaming.de/admin`, or `http://localhost:4321/admin` locally). It's a
single-user editor and nothing links to it from the public pages.

## Signing in

Two ways, whichever you configured in `.env`:

- GitHub OAuth: click "Sign in with GitHub". Only the account named in
  `CMS_ALLOWED_LOGIN` (which defaults to your `GITHUB_USERNAME`) gets in.
- Bearer token: paste your `CMS_TOKEN`. Handy for first setup or scripts.

Edits save immediately and appear on the live site with no rebuild.

## Getting around

The admin is a left-hand menu grouped by job. The Dashboard is the landing
screen: quick counts and jump-in links, plus a nudge when guestbook entries are
waiting. The top bar has a preview toggle and a "View site" link. A locale switch
(EN/DE) in the sidebar controls which language you're editing; every text field
edits the currently selected locale.

## What you can edit, and what you can't

Everything on the site that isn't pulled from an API is editable. The menu groups
it like this:

| Group | Screen | Controls |
|---|---|---|
| Content | Site identity | Name, handle, location, role. |
| Content | Home intro | The Home hero: headline, lede, status. `**bold**` works in the lede. |
| Content | About / bio | The bio paragraphs (`**bold**` supported). |
| Content | Hobbies | The "off the clock" tiles (title, blurb, icon, colour). |
| Content | Links | Social and contact buttons. Icons: `gh, mail, x, linkedin, mastodon, youtube, discord, instagram, bluesky, globe`. A link with href `#contact` becomes the "get in touch" jump. |
| Content | Right now | The "right now" rows. |
| Structure & media | Layout | Reorder modules within an area, move them between areas, or hide them. |
| Structure & media | Asset library | Your central store of reusable files: images, SVGs, GIFs, PDFs, Markdown. Upload, organise (folders and tags), edit metadata, see where each is used. |
| Structure & media | Gallery | Curate the image galleries on the site, picked from the library. |
| Widgets | Presence | The "right now" widget and what the playtime charts record: which Discord categories to show live and which to record, how long to keep history, and a hidden-activities list (names never shown publicly, whatever the category). |
| Widgets | Listening | How many rows the Listening lists show — before "show more" and at most. |
| Widgets | Played | The same, for the Played lists — a separate setting, so the two can differ. |
| Community | Guestbook | Approve, reject, or delete visitor entries (nothing is public until you approve it). |
| Insights | Analytics | Anonymous traffic and engagement. No cookies, no IPs, nothing personal. |

Projects and activity are not editable, because they come straight from GitHub.
The Projects and Featured sections show your pinned repositories first, then your
most recently updated repos (forks and archived repos excluded). To change what
appears, pin or unpin repos on your GitHub profile or push to them; the site
catches up on the next sync (every 6 hours) with no rebuild.

## Rearranging the page (Layout)

Each area (Home, Work, Life, About) renders its modules top to bottom. On Layout
you can:

- Reorder a module within its area with the up and down arrows.
- Move a module to a different area, or to Hidden to take it off the site, with
  the dropdown.
- Bring a hidden module back by choosing an area for it.

Then click Save layout. One rule: an area must keep at least one module, so you
can't leave an area empty. Changes take effect on the next page load.

## Working with images and files

The asset library is your central, reusable media store. One upload can be used in
many places, and the same file is never stored twice; identical uploads are
de-duplicated by content.

1. Asset library, then Upload (images, SVGs, GIFs, PDFs, Markdown). Images get
   optimised, responsive versions automatically, generated on first use.
2. Organise with folders and tags, and use search and type filters to find
   things.
3. Click an asset to edit its alt text, title, caption, and description, move it
   between folders, or retag it. The panel shows where it's used, and deleting
   warns you if it's referenced anywhere.
4. To place images on the site, go to Gallery, then Add image, and pick from the
   library. The caption there is gallery-specific; alt text comes from the asset.
   Reorder or remove as needed.
5. Want more than one gallery? Gallery, then New gallery, creates another (it
   starts Hidden, so use Layout to place it). The built-in gallery can't be
   deleted.

Markdown assets publish as their own page at `/md/<slug>` (with a link back to the
site); PDFs get a download link; SVGs can be used as themeable icons.

Library images can also go straight into content: a hero portrait (Site identity,
then Choose image), inline images in the bio (About, then + image), and uploaded
SVG link icons (Links, then pick SVG).

## Previewing

The preview toggle opens the live site beside the editor and reloads after each
save, so you can see changes without leaving the field you're editing. It follows
the area you're working in (Hobbies goes to Life, About to the bio, and so on),
with an area picker to jump elsewhere. A full-width preview screen is there for a
bigger look. Preview traffic is never counted in analytics. Use "View site" to
open the real site in a new tab.

## Adding your social links

1. Go to Links, then Add link.
2. Set the label (for example "LinkedIn"), the href (for example
   `https://linkedin.com/in/you`), and an icon key from the list above.
3. Mark one primary if you want it emphasised. Save.

For an email button, add a link with href `mailto:you@example.com` and icon
`mail`.
