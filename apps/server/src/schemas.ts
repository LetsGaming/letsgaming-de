/**
 * JSON schemas for CMS write bodies. Fastify validates and coerces against these
 * before a handler runs, so malformed content can't reach the store. Kept in one
 * place; each route references the piece it needs.
 */

const localized = {
  type: "object",
  required: ["en"],
  properties: { en: { type: "string" }, de: { type: "string" } },
  additionalProperties: false,
} as const;

const localizedArray = { type: "array", items: localized } as const;

// href accepts http(s), mailto, or a site-relative path — never javascript:/data: (SEC-04).
const href = {
  type: "string",
  pattern: "^(https?://|mailto:|/)[^\\s]*$",
} as const;

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
      avatar: { type: "string", pattern: "^(asset:[A-Za-z0-9_-]+)?$" },
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
      tone: { type: "string", enum: ["purple", "coral", "mint", "sun"] },
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
        items: { enum: ["game", "streaming", "music", "watching", "custom", "steam"] },
        uniqueItems: true,
      },
    },
    additionalProperties: false,
  },
  galleryItem: {
    type: "object",
    required: ["id", "module", "asset", "caption"],
    properties: {
      id: { type: "string", minLength: 1 },
      module: { type: "string", minLength: 1 },
      asset: { type: "string", pattern: "^asset:[A-Za-z0-9_-]+$" },
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
