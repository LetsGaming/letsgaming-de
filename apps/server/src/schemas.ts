/**
 * JSON schemas for CMS write bodies. Fastify validates and coerces against these
 * before a handler runs, so malformed content can't reach the store. Kept in one
 * place; each route references the piece it needs.
 *
 * Every enum and pattern here is *imported*, never typed out. A hand-written
 * `enum: ["purple", "coral", "mint", "sun"]` is a copy of a list that lives in
 * core, and the copies drift silently in the one direction that hurts: the schema
 * keeps accepting a value the renderer dropped, so the CMS saves a tone that
 * renders nothing. That exact pair — dropdown and renderer disagreeing — has
 * already cost this project once.
 */

import {
  ASSET_REF_PATTERN,
  LOCALES,
  HREF_PATTERN,
  OPTIONAL_ASSET_REF_PATTERN,
  PRESENCE_CATEGORIES,
  MUSIC_LIST_BOUNDS,
  LIST_DISPLAY_BOUNDS,
  WRAPPED_BOUNDS,
  TONES,
} from "@lg/core";

const localized = {
  type: "object",
  required: ["en"],
  properties: { en: { type: "string" }, de: { type: "string" } },
  additionalProperties: false,
} as const;

const localizedArray = { type: "array", items: localized } as const;

// href accepts http(s), mailto, or a site-relative path — never javascript:/data:
// (SEC-04). The pattern is core's, the same one `safeHref` enforces at read time:
// these are belt-and-braces for one rule, and two spellings of one rule is one
// rule and one bug. They already disagreed on case-sensitivity.
const href = { type: "string", pattern: HREF_PATTERN } as const;

export const schemas = {
  localized,

  meta: {
    type: "object",
    required: ["name", "handle", "location", "role"],
    properties: {
      name: { type: "string", minLength: 1 },
      handle: { type: "string", minLength: 1 },
      location: localized,
      role: localized,
      avatar: { type: "string", pattern: OPTIONAL_ASSET_REF_PATTERN },
    },
    additionalProperties: false,
  },

  headline: {
    type: "object",
    required: ["before", "highlight", "after"],
    properties: { before: localized, highlight: localized, after: localized },
    additionalProperties: false,
  },

  lede: localized,
  bio: localizedArray,

  status: {
    type: "object",
    required: ["verb", "now"],
    properties: { verb: localized, now: localized },
    additionalProperties: false,
  },

  project: {
    type: "object",
    required: ["id", "name", "tag", "description", "meta", "href"],
    properties: {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      tag: localized,
      description: localized,
      meta: localizedArray,
      href,
      featured: { type: "boolean" },
      repo: { type: "string" },
      sort: { type: "integer" },
    },
    additionalProperties: false,
  },

  hobby: {
    type: "object",
    required: ["id", "title", "blurb", "tone"],
    properties: {
      id: { type: "string", minLength: 1 },
      title: localized,
      blurb: localized,
      icon: { type: "string" },
      tone: { type: "string", enum: TONES },
      sort: { type: "integer" },
    },
    additionalProperties: false,
  },

  link: {
    type: "object",
    required: ["id", "label", "href"],
    properties: {
      id: { type: "string", minLength: 1 },
      label: localized,
      href,
      icon: { type: "string" },
      primary: { type: "boolean" },
      sort: { type: "integer" },
    },
    additionalProperties: false,
  },

  now: {
    type: "object",
    required: ["id", "key", "value"],
    properties: {
      id: { type: "string", minLength: 1 },
      key: localized,
      value: localized,
      sort: { type: "integer" },
    },
    additionalProperties: false,
  },
  presence: {
    type: "object",
    required: ["show"],
    properties: {
      show: {
        type: "array",
        items: { enum: PRESENCE_CATEGORIES },
        uniqueItems: true,
      },
      sample: {
        type: "array",
        items: { enum: PRESENCE_CATEGORIES },
        uniqueItems: true,
      },
      // null = keep forever; the numbers are the RETENTION_OPTIONS days.
      retentionDays: { type: ["integer", "null"], enum: [null, 730, 365, 180, 90, 30] },
      hidden: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 200 },
        maxItems: 200,
      },
    },
    additionalProperties: false,
  },
  music: {
    type: "object",
    // No required fields: the sanitizer fills any omitted count from the default,
    // so a partial body still writes a valid row. Bounds come from @lg/core so the
    // schema and the sanitizer can't drift.
    properties: {
      initialCount: { type: "integer", minimum: MUSIC_LIST_BOUNDS.min, maximum: MUSIC_LIST_BOUNDS.max },
      maxCount: { type: "integer", minimum: MUSIC_LIST_BOUNDS.min, maximum: MUSIC_LIST_BOUNDS.max },
    },
    additionalProperties: false,
  },
  playtime: {
    type: "object",
    // Same shape and bounds as `music` — a separate stored value so the two
    // modules' limits can differ; the sanitizer fills any omitted count.
    properties: {
      initialCount: { type: "integer", minimum: LIST_DISPLAY_BOUNDS.min, maximum: LIST_DISPLAY_BOUNDS.max },
      maxCount: { type: "integer", minimum: LIST_DISPLAY_BOUNDS.min, maximum: LIST_DISPLAY_BOUNDS.max },
    },
    additionalProperties: false,
  },
  wrapped: {
    type: "object",
    // The recurring-display schedule. No required fields: the sanitizer fills any
    // omitted one and drops a malformed date, so a partial body still writes a valid
    // row. Bounds come from @lg/core so schema and sanitizer can't drift.
    properties: {
      enabled: { type: "boolean" },
      everyMonths: { type: "integer", minimum: WRAPPED_BOUNDS.everyMonths.min, maximum: WRAPPED_BOUNDS.everyMonths.max },
      forWeeks: { type: "integer", minimum: WRAPPED_BOUNDS.forWeeks.min, maximum: WRAPPED_BOUNDS.forWeeks.max },
      fromDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      topCount: { type: "integer", minimum: WRAPPED_BOUNDS.topCount.min, maximum: WRAPPED_BOUNDS.topCount.max },
    },
    additionalProperties: false,
  },
  galleryItem: {
    type: "object",
    required: ["id", "module", "asset", "caption"],
    properties: {
      id: { type: "string", minLength: 1 },
      module: { type: "string", minLength: 1 },
      asset: { type: "string", pattern: ASSET_REF_PATTERN },
      caption: localized,
      sort: { type: "integer" },
    },
    additionalProperties: false,
  },
  galleryModule: {
    type: "object",
    required: ["heading"],
    properties: { heading: localized, note: localized },
    additionalProperties: false,
  },
  /**
   * A whole gallery's order. `ids` is the list as the CMS shows it; the server
   * renumbers `sort` to match. The entire list rather than a diff, exactly as
   * `layout` below sends every area's modules — one request that can't
   * half-succeed, and the same shape for the same job.
   */
  galleryOrder: {
    type: "object",
    required: ["module", "ids"],
    properties: {
      module: { type: "string", minLength: 1, maxLength: 64 },
      ids: {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 64 },
        uniqueItems: true,
        maxItems: 500,
      },
    },
    additionalProperties: false,
  },
  /** Same body as `layout`, plus the locale to resolve in. The editor canvas asks
   *  "what would this look like?"; `layout` says "make it so". */
  preview: {
    type: "object",
    required: ["order"],
    properties: {
      order: {
        type: "array",
        items: {
          type: "object",
          required: ["area", "modules"],
          properties: {
            area: { type: "string", minLength: 1 },
            modules: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      },
      locale: { type: "string", enum: LOCALES },
    },
    additionalProperties: false,
  },
  layout: {
    type: "object",
    required: ["order"],
    properties: {
      order: {
        type: "array",
        items: {
          type: "object",
          required: ["area", "modules"],
          properties: {
            area: { type: "string", minLength: 1 },
            modules: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
} as const;
