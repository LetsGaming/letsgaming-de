# Concepts

The durable ideas the project is built on. These change least when the code
changes, so they're the best place to understand why things are shaped the way
they are.

- [information-architecture](./information-architecture.md) is the nav model:
  areas and modules, the four promotion gates, depth over breadth, and the
  build-time lint that keeps the tree from rotting.
- [data-model](./data-model.md) is the three kinds of data in the store, the
  tables, the content model, and the resolved `SiteView` the frontend renders.
- [sources-and-sync](./sources-and-sync.md) is the `Source` contract, the three
  live sources, mock versus real, snapshot versus current, and the sync worker.
- [analytics-and-privacy](./analytics-and-privacy.md) is the two analytics
  systems, what each can and can't measure, retention, and the GDPR posture
  including the no-Impressum decision.
- [the-cms](./the-cms.md) is the "small CMS" philosophy, how it's held, and where
  the line sits now that there's an asset library.
- [glossary](./glossary.md) defines the project's vocabulary in one place.
- [localization](./localization.md) — English and German: CMS-authored content vs. the typed UI-string catalog.
