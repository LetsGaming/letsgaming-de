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
      href: { type: "string" },
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
      href: { type: "string" },
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
} as const;
