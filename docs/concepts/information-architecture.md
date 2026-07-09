# Information architecture

The IA is what keeps the site from turning into a wall of tabs as it grows. It's
worth understanding before you add anything visible, because "where does this
go?" has a real answer here, and a lint that enforces it.

## Areas and modules

The nav is a small, fixed set of themed areas. Each area answers one question a
visitor has. Features and data sources are modules, and a module is placed inside
the area it belongs to. It does not get its own nav item by default. Adding
content grows a section within a theme; it does not grow the nav.

The launch tree is one level, four areas:

| Area | Answers |
|---|---|
| Home | who is this, quickly? |
| Work | what do you build? |
| Life | who are you outside that? |
| About | the longer story, and how to reach you |

Within Work, activity sits above projects.

Modules are defined in `packages/core/src/modules.ts` as a `ModuleKind` union.
The current kinds: `hero`, `featured`, `glance` (Home); `activity`, `highlights`,
`coding`, `projects` (Work); `hobbies`, `now`, `guestbook`, `presence`, `gallery`
(Life); `bio`, `contact` (About). A module descriptor carries no area of its own,
because placement is the nav tree's job (a leaf's `modules: string[]`). The same
module could be placed anywhere the IA decides.

## The promotion gate

Content enters as a module inside an existing node. A new nav node is a promotion
it has to earn by clearing all four gates:

1. Distinct question. It answers something no existing sibling already owns.
2. Weight to stand alone. Several substantial modules, or one deep interactive
   experience. One card of light data is a section, not a node.
3. Homeless elsewhere. Putting it in any existing sibling would feel forced.
4. Durable, not seasonal. Experiments live as modules first and graduate only if
   they prove out.

The gates apply the same way at every level of the tree.

## Depth, not breadth

The "about five at most" limit is a property of a single level, human
scannability of one row, not of the whole site. So:

- Any one level stays at five children or fewer. When a node gets too heavy, you
  split it into sub-nodes with their own secondary nav inside it. You do not add
  a sibling at the top. The total number of nodes across the tree is unbounded;
  the breadth of any one level stays small.
- The unit is recursive. A node is either a leaf (holds modules) or a branch
  (holds two or more child nodes). Same shape at every depth. The ladder is
  module, then sub-area, then area.
- Aim for two levels; treat three as the practical ceiling. Split only when each
  sub-theme independently clears the four gates. Most of the site stays one level
  deep for years.
- The lifecycle runs both ways. Modules get promoted to nodes once they hit
  critical mass; nodes that thin out get demoted back to modules. A top row that
  strains is the signal that two top areas share a parent question and should
  merge under it.

## The lint keeps it honest

The rules above are enforced by a build-time check rather than by discipline.
`pnpm lint:nav` runs `packages/core/src/nav-lint.ts` and fails the build on any
of these:

| Code | Fails when |
|---|---|
| `MAX_CHILDREN` | a node has more than five children |
| `MAX_DEPTH` | the tree nests deeper than three levels |
| `THIN_BRANCH` | a branch has fewer than two children |
| `EMPTY_LEAF` | a leaf places zero modules |
| `LEAF_AND_BRANCH` | a node has both `modules` and `children` |
| `DUPLICATE_ID` | two nodes share an id |
| `DANGLING_MODULE` | a leaf points at a module id that isn't registered |
| `ORPHAN_MODULE` | a registered module isn't placed by any leaf |

The lint runs first in `pnpm build` and in CI, so a broken tree can't merge. This
is [ADR-0006](../adr/0006-recursive-nav-lint.md).

## Where it lives in code

- The tree and module types: `packages/core/src/nav.ts`,
  `packages/core/src/modules.ts`.
- The canonical launch tree and module registry: `packages/core/src/ia.ts`.
- The lint: `packages/core/src/nav-lint.ts`.
- Editing at runtime: the CMS layout screen and IA repo
  (`packages/db/src/ia-repo.ts`), which reject a change that would fail the lint.

To add or split a node in practice, see
[guides/extending](../guides/extending.md).
