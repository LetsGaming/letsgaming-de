# Design system

The look was previously "locked from the prototype" — ported faithfully, never
re-decided. This is the re-decision. It exists because the old system had one
elevation for sixteen surfaces, an accent doing nine jobs, and three typefaces
with no hierarchy between them, which is not a system: it's an absence of one.

Everything here is checkable in a diff. If a rule can't be grepped, it isn't a
rule, it's a preference.

## The three rules

**Purple means now.** The accent has three named jobs and no others:

1. Live or just-happened data.
2. The one primary action per view.
3. The focus ring.

The third is real and worth naming rather than hiding as an exception. A focus
ring is an accessibility floor: it needs the most visible colour available, and
`--live-ink` is it. A rule with three stated exceptions beats a rule with one
unstated one — the unstated exception is how you get back to nine.

Nothing else. Not the active nav tab, not a selected setting, not a toggle, not a
hover, not a chart series, not the page background. Selected states use contrast —
ink versus muted — never hue. It previously did nine jobs, which is the same as
doing none: `grep -c 'var(--purple' app.css` returned 145.

The specific purple is sampled from the LED strip on the shelf, photographed on
`/life`. That's the reason it's this purple and not the violet-500 that shipped
before, and the caption on that photo says so in public.

**Colour is imported, never invented.** Purple is the only colour the palette
owns. Everything else comes from something real: language colours from GitHub
linguist, a game's cover art straight from RAWG, plants being green because they
are. Consequence: the page gets more colourful the more real data it holds, and no
palette decision can fake that.

**A card is one subject.** Not a section, not prose, not a stream. A project, a
guestbook note, a photo, the presence unit ("right now", live from Discord).
Section headings, the hero, the bio and `now` live on
`surf-0` with no frame. That's why About has always read as human: it was already
following this rule by accident.

## Two densities

| Surface | Density | Why |
|---|---|---|
| Site | Comfortable | Mobile-first. Read on a phone, at arm's length, by someone who isn't working. |
| CMS | Compact | Desktop-first. Fourteen panels, an asset library, a chart. Dense on purpose. |

Both work on the other device. Only one is optimised for it. The split already
existed as values — the old `tokens.css` carried a second radius set commented
"tighter radii for dense admin/chrome UI (the CMS)" — it just wasn't written
down as a principle, so nothing enforced it.

One vocabulary, two ranges. `[data-density="compact"]` on the CMS root remaps
radius and spacing; nothing else changes.

## Elevation

**On dark, lift is surface lightness, not shadow.** A drop shadow at `#131215`
has nothing darker to fall onto — it's invisible. That is precisely why the old
`--sh-1` and `--sh-2` carried purple glow: the prototype needed depth, dark
wouldn't give it a shadow, so it reached for a bloom. Reasonable move, wrong
tool.

| Level | Token | Holds |
|---|---|---|
| 0 | `--surf-0` | The page. Prose, headings, streams, the glance line. |
| 1 | `--surf-1` | A group — an event stream, a readout, a set from one source. |
| 2 | `--surf-2` | An object — a project, a note, a photo. Also the hover state of level 1. |
| 3 | `--surf-3` | The anchor. One per page, maximum. Also the hover state of level 2. |

Three usage rules:

1. One anchor per page. Life has one (presence). Work has none, and that's fine —
   Work is dense, not loud.
2. Never nest a level inside itself. The old presence module went card → card →
   card, which is what nesting looks like when every level is the same level.
3. Prose never gets a level.

Light mode inverts and shadows come back, because a light page has room to cast
one.

## Motion

Motion communicates state change, directs attention, or expresses character. If
it does none of those, it's deleted.

| What | When | Value |
|---|---|---|
| Pulse | Something is live | `--dur-pulse`, on the live dot only |
| Hover | This is interactive | +1 surface level, +1 line, `--dur-fast` |
| Press | You touched it | `translateY(2px)`, `--dur-press` |

**Hover is an affordance, so it appears only on things that are actually
interactive.** The old code tilted `.card, .tile` — `.card` is an `<a>`, so that
was honest; `.tile` is a plain `<div>` that does nothing, so the hobby tiles
advertised interactivity they didn't have. Under this rule the hobby photos
either link to the repo behind them (plants → `plantcare-tracker`, shelf →
`LED-Controller-Websocket`) or they don't hover. Pick one; don't lie.

The `rise` entrance is gone. It fired on every element individually — avatar,
eyebrow, h1, lede, status dot, each button — so the page performed before it
could be read. The tilt is gone with it: at ±6° it expressed character but
communicated nothing, and hover now carries the affordance it was accidentally
providing.

`prefers-reduced-motion` disables all of it. That was already true and stays a
floor, not an option.

## Glow

> Glow marks one job: something is happening right now. Nowhere else.

Ambient bloom behind a hero is the cheapest way to make a dark page look
expensive: one CSS rule, instant atmosphere, no decision required — which is
exactly why it's on every third site and therefore means nothing. This isn't
that. It's a 7px dot with a 9px halo that pulses because something is happening right
now — too small to read as atmosphere, too specific to read as decoration. It's
an LED, which is where the purple came from.

**Grep `--glow-live`.** Two consumers today: the status dot and the freshness dot,
which are the same job wearing two elements. That's fine. Six would not be — at
that point it's atmosphere again, which is the thing the rule exists to prevent.

The rule originally said *one element*, and meant *one job*. Worth knowing which,
because the greppable version of a rule is the version that gets enforced, and a
count is not a reason. Not the primary button: a CTA isn't "now", it's an action. Purple
fill, no halo.

## States

This is the part that matters most and the part the site had least of. Fourteen
modules, four external sources, and two empty states between them
(`GuestbookSection`, `CodingSection`). A page that only renders the happy path
has never been used by anybody.

### Freshness is a state, not a decoration

The brief's failure mode is *it goes stale*. So the state that matters isn't
`empty`, it's `stale` — and the site currently has no concept of it.

| State | Meaning | Render |
|---|---|---|
| `fresh` | Synced inside the source's TTL | Normally |
| `stale` | Synced, but past TTL | The data **plus its age**, muted |
| `empty` | Synced fine, nothing to show | What would be here, and why it isn't |
| `failed` | Last sync errored | Last known data, its age, and that the sync failed |
| `never` | No successful sync yet | The true empty |

**A synced module must never render as if it were fresh when it isn't.** The
site's entire claim is that it updates itself. Showing three-day-old data with no
timestamp makes it lie about the one thing it promises — worse than showing
nothing. `syncedAt` already exists in the resolved view and is currently unused;
this is what it's for.

### TTL belongs to the source

Staleness isn't global. Discord presence is worthless after two minutes; a
fortnight of coding time is fine an hour old.

| Source | TTL | Why |
|---|---|---|
| Discord | 2 min | It's "right now" or it's "last seen". |
| GitHub | 1 h | Events, repos, contributions. |
| Wakapi | 1 h | Tracked time. |
| CMS | — | Local. Can't be stale. |

So `Source<Raw, Normalized>` (ADR 0005) gains a `ttl`. One field on an existing
interface, which is what that contract was built to absorb — "adding a source =
one adapter + one registry line + one `SourceData` field."

### Per-module

| Module | Source | States beyond `fresh` |
|---|---|---|
| `hero` | CMS | No avatar · no status line |
| `glance` | GitHub + sync | `never` (first boot) · `stale` · `failed` |
| `featured` | GitHub | `empty` (none pinned) · no description · `stale` |
| `activity` | GitHub | `empty` (no events) · `stale` · `failed` · one event · 500 events |
| `coding` | Wakapi | `empty` ✓ exists · zero hours this week · `failed` |
| `projects` | GitHub | `empty` · no description · one repo · 19 repos · `stale` |
| `hobbies` | CMS | No photo yet · caption without photo |
| `now` | CMS | `empty` |
| `guestbook` | DB | `empty` ✓ exists · unapproved-only · submitting · submit failed · 200-char note |
| `presence` | Discord | Offline · online, not playing · listening · can't reach Discord · live |
| `playtime` | Sessions + RAWG | `empty` no plays yet · game without a cover (monogram) · no `RAWG_API_KEY` (covers/genres absent) · a played day |
| `gallery` | Assets | `empty` · image fails to load |
| `bio` | CMS | — |
| `contact` | Form | Idle · submitting · sent · failed · validation error |
| `posts` | Assets | `empty` · hidden · post not found ✓ exists |

`presence` is the worst case and the most important: it's the anchor, it's the
floor ("a visitor notices the thing is alive"), and it depends on two third
parties. When Discord is down the module must still say something true. A blank
anchor is the failure mode.

### Interaction states

Every interactive element: `default` · `hover` (+1 surface) · `active`
(`translateY(2px)`) · `focus-visible` (2px `--live` outline, 2px offset — already
in `app.css`, stays). No `disabled`: keep controls enabled and respond on use.

## What dies

| Token | Why |
|---|---|
| `--bg-glow` | The aurora. Signals "future technology company" on a page about houseplants. |
| `--sh-1`, `--sh-2` | Purple glow faking depth. Surface steps do it honestly. |
| `--coral`, `--sun`, `--mint` | Two jobs, both gone: tinting hobby tiles (now photos) and repainting real language colours (now real). |
| `--tile-purple/coral/mint/sun` | The four hobby gradients. Photos. |
| `--purple-wash` | Only consumer was `.eyebrow`, which dies. |
| `--r`, `--r-sm` | Replaced by the radius scale. 26px on a 90px box is most of the box. |
| `--heat-0..4` | Recoloured neutral. Only today is purple — which also makes "did he commit today" readable at a glance, which an all-violet grid can't do. |

Verify `--ghost-bg`, `--ghost-shadow`, `--on-accent-soft` and `--stack-1..7`
before touching them — `--stack-*` is the CMS analytics chart and is categorical
data on an admin surface, so it likely stays.

Also not a token but the same pass: `langColors` in `apps/web/src/lib/icons.ts`
gets linguist's real values, with a lightness floor for the dark background.
JSON is `#292929` and PowerShell is `#012456` — invisible at `#131215` — so lift
lightness, keep hue, and let JSON stay grey because JSON has no identity. CSS's
real colour is `#663399`: a purple on the page that wasn't chosen and was earned.

## The gate

Three decisions here a model wouldn't reach by default:

1. The accent has exactly one semantic job, and it's greppable.
2. Colour is imported, never invented — so the palette can't fake what the data
   doesn't have.
3. The one glowing element is the live dot, and the purple is measured off a
   physical LED strip photographed on the same site.

See also: [information-architecture](./information-architecture.md) for the tree
the components sit in, [sources-and-sync](./sources-and-sync.md) for the contract
the TTL hangs off, and [the-cms](./the-cms.md) for the compact density.
