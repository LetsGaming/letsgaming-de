# Extending the site

Three common changes, each small and local by design. The seams that make them
small are explained in [ARCHITECTURE](../ARCHITECTURE.md) and
[concepts/sources-and-sync](../concepts/sources-and-sync.md); this is the how-to.

## Add a data source

Adding a source touches the sources package and one line of the core registry.
The store, the read API, and the whole frontend stay as they are, because they
only ever speak the normalized shape.

1. Write the adapter in `packages/sources/src/<name>/`. Implement
   `Source<Raw, Normalized>`: an `id`, a `schedule` (cron-ish), a `fetch()` that
   hits the API, and a pure `normalize(raw)` that returns your common shape. Keep
   `fetch` and `normalize` separate so `normalize` stays unit-testable.
2. Add a deterministic mock alongside it (`<name>/mock.ts`) that returns the same
   normalized shape, so the site still renders in dev without credentials.
3. Add the normalized shape to `SourceData` in `packages/core/src/source.ts`
   (one field, keyed by source id).
4. Register it in `packages/sources/src/registry.ts`: the real adapter when its
   config is present, the mock otherwise (in dev).
5. Surface it in a module. Add a `ModuleKind` and resolve its data (next
   section). The sync worker picks the source up from the registry with no
   further wiring.

Follow the existing adapters (`github`, `wakapi`) as templates, and add a
`normalize` test next to the code. Not every external API is a source, though:
game metadata uses RAWG as a by-name lookup kept *beside* the contract, not inside
it — see
[sources-and-sync](../concepts/sources-and-sync.md#game-metadata-not-a-source).

## Add a module

A module is a placeable content block. Adding a kind is a new branch in a few
switch-like spots and nothing on the request path beyond that.

1. Add the kind to the `ModuleKind` union in `packages/core/src/modules.ts`.
2. Add its resolved data to the `ResolvedModule` union in
   `packages/core/src/view.ts`.
3. Handle the kind in `resolveSiteView()` (`packages/core/src/resolve.ts`): turn
   stored content and source data into the resolved shape (localize strings,
   pre-compute anything the frontend shouldn't).
4. Add the kind to the `kind → component` map in
   `apps/web/src/components/shell/Module.vue`, and write the section component
   in `apps/web/src/components/sections/`.
5. Add the kind to `PANEL_FOR_KIND` in
   `apps/web/src/composables/useLayoutEditor.ts` — it's a
   `Record<ModuleKind, …>` on purpose, so a new kind won't compile until it says
   which CMS panel clicking it opens (`null` is a valid answer for a synced
   module nothing edits).
5. Place its id in a leaf's `modules`, either in the seed IA
   (`packages/core/src/ia.ts`) or through the CMS Layout screen. The nav doesn't
   change; a section grows inside an existing area.

The nav lint will flag a module that no leaf places (`ORPHAN_MODULE`) or a leaf
pointing at a kind that isn't registered (`DANGLING_MODULE`), so a half-wired
module fails the build rather than shipping broken.

## Add or split a nav node

Most growth is placing a module in an existing node, not adding a node. When an
area genuinely gets too heavy, you split it rather than add a top-level sibling.

- Edit the tree in `packages/core/src/ia.ts` (the launch tree) or through the CMS.
- To split, turn the heavy leaf into a branch with two or more child nodes, each
  with its own modules. Don't add a fifth or sixth sibling at the top; a straining
  top row is the signal that two areas share a parent question and should merge
  under it instead.
- `pnpm lint:nav` enforces the shape: at most five children per level, depth at
  most three, no thin branches, no empty leaves. See
  [concepts/information-architecture](../concepts/information-architecture.md) for
  the gates a new node has to clear before it's worth creating.
