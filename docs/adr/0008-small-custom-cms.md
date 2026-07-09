# 0008: A small custom CMS, forever

**Status:** Accepted · 2026 · (OVERVIEW)

## Context
The site needs owner-editable content, but must never grow toward
Typo3/WordPress. Scope discipline is a feature.

## Decision
A small custom CMS: CRUD over the owner-edited content, image upload (resize to
WebP, local storage), and an analytics view, nothing more. Auth is GitHub OAuth
(single user) or a bearer token. Every proposed feature is measured against "does
this project actually need it?"

## Consequences
- The CMS surface stays a handful of endpoints + one admin island.
- No asset library / DAM / plugin system / page builder.
- German content is added here per locale, a content task, not a migration.
