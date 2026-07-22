/**
 * Build-time reader for the backend's OpenAPI spec, shaping it into a small,
 * render-ready model for the on-site `/docs/api` reference.
 *
 * The canonical spec is `openapi.yml` at the repo root — one hand-authored,
 * self-documenting file that external tooling (codegen, Swagger UI, Postman) can
 * also consume. This module is the *display* side: it parses that file at build
 * time and flattens it into groups + operations + schema tables the Astro page
 * renders in the site's own design (no Swagger CDN, no client-side spec fetch).
 *
 * Read with `node:fs` relative to `process.cwd()` — the same `../../` resolution
 * the content collection already uses for `docs/`, so it works identically in dev
 * and in the Docker build (both run Astro from `apps/web`). Nothing here reaches
 * the client bundle; the reference page prerenders.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DocGroup, DocLink } from "./docs.js";

// ── the sidebar tab ───────────────────────────────────────────────────────────

/** The synthetic docs nav entry for the rendered API reference (route `/docs/api`). */
export const API_NAV_LINK: DocLink = { slug: "api", title: "API reference" };

/**
 * Add the API-reference link to the docs sidebar as its own "Reference" group,
 * so the tab shows on every docs page. Pure; both the markdown docs pages and the
 * API page call it so the nav is identical everywhere.
 */
export function withApiNav(tree: DocGroup[]): DocGroup[] {
  return [{ label: "Reference", items: [API_NAV_LINK] }, ...tree];
}

// ── the render model ──────────────────────────────────────────────────────────

export interface ApiInfo {
  title: string;
  version: string;
  /** Markdown overview from `info.description`. */
  description: string;
}

export interface ApiParam {
  name: string;
  location: string; // query | path | header | cookie
  required: boolean;
  description: string;
  type: string;
}

export interface ApiResponse {
  status: string;
  description: string;
  /** Component schema name, when the body is a single `$ref` we can name. */
  schema?: string;
}

export interface ApiOperation {
  method: string; // GET | POST | ...
  path: string;
  summary: string;
  description: string;
  /** True when the operation opts out of auth (`security: []`); else it needs a CMS credential. */
  public: boolean;
  parameters: ApiParam[];
  requestContentTypes: string[];
  responses: ApiResponse[];
}

export interface ApiGroup {
  tag: string;
  description: string;
  operations: ApiOperation[];
}

export interface ApiSchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiSchema {
  name: string;
  description: string;
  fields: ApiSchemaField[];
}

export interface ApiReference {
  info: ApiInfo;
  servers: { url: string; description: string }[];
  groups: ApiGroup[];
  schemas: ApiSchema[];
}

const METHODS = ["get", "post", "put", "delete", "patch"] as const;

// Loose shapes — we validate defensively as we read rather than typing all of OpenAPI.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

let cached: ApiReference | null = null;

/** Parse `openapi.yml` and build the reference model (cached across pages). */
export function loadApiReference(): ApiReference {
  if (cached) return cached;
  // Repo-root `openapi.yml`. The cwd-relative default is correct at build time
  // (cwd is the app dir when prerendering); `OPENAPI_PATH` covers the runtime
  // case, where the server starts from the output dir and "../.." misses.
  const path = process.env.OPENAPI_PATH ?? resolve(process.cwd(), "..", "..", "openapi.yml");
  const source = readFileSync(path, "utf8");
  const doc = obj(parseYaml(source));
  cached = build(doc);
  return cached;
}

/** Follow a local `#/...` ref within the document; returns `{}` if it can't. */
function deref(doc: Json, ref: string): Json {
  if (!ref.startsWith("#/")) return {};
  let node: unknown = doc;
  for (const key of ref.slice(2).split("/")) node = obj(node)[key];
  return obj(node);
}

/** A human-readable type label for a schema node (handles $ref, arrays, unions, enums). */
function typeLabel(schema: Json): string {
  if (typeof schema.$ref === "string") return schema.$ref.split("/").pop() ?? "object";
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((e) => JSON.stringify(e)).join(" | ");
  const t = schema.type;
  if (Array.isArray(t)) return t.join(" | ");
  if (t === "array") {
    const items = obj(schema.items);
    return `${typeLabel(items)}[]`;
  }
  if (typeof t === "string") {
    const fmt = typeof schema.format === "string" ? ` (${schema.format})` : "";
    return `${t}${fmt}`;
  }
  return "object";
}

function buildParam(doc: Json, node: Json): ApiParam {
  const p = typeof node.$ref === "string" ? deref(doc, node.$ref) : node;
  return {
    name: str(p.name, "?"),
    location: str(p.in, "query"),
    required: p.required === true,
    description: str(p.description),
    type: typeLabel(obj(p.schema)),
  };
}

/** Pull a component schema name out of a response body, when it's a single named ref. */
function responseSchemaName(response: Json): string | undefined {
  const content = obj(response.content);
  for (const media of Object.values(content)) {
    const schema = obj(obj(media).schema);
    if (typeof schema.$ref === "string") return schema.$ref.split("/").pop();
  }
  return undefined;
}

function buildOperation(doc: Json, method: string, path: string, op: Json): ApiOperation {
  const params = arr(op.parameters).map((p) => buildParam(doc, obj(p)));

  const rb = typeof obj(op.requestBody).$ref === "string"
    ? deref(doc, str(obj(op.requestBody).$ref))
    : obj(op.requestBody);
  const requestContentTypes = Object.keys(obj(rb.content));

  const responses: ApiResponse[] = Object.entries(obj(op.responses)).map(([status, raw]) => {
    const r = typeof obj(raw).$ref === "string" ? deref(doc, str(obj(raw).$ref)) : obj(raw);
    return {
      status,
      description: str(r.description),
      ...(responseSchemaName(r) ? { schema: responseSchemaName(r) } : {}),
    };
  });

  return {
    method: method.toUpperCase(),
    path,
    summary: str(op.summary),
    description: str(op.description),
    public: Array.isArray(op.security) && op.security.length === 0,
    parameters: params,
    requestContentTypes,
    responses,
  };
}

function build(doc: Json): ApiReference {
  const info = obj(doc.info);
  const tags = arr(doc.tags).map(obj);

  // Collect operations, keyed by their (first) tag so groups follow the tag order.
  const byTag = new Map<string, ApiOperation[]>();
  for (const [path, itemRaw] of Object.entries(obj(doc.paths))) {
    const item = obj(itemRaw);
    for (const method of METHODS) {
      if (!item[method]) continue;
      const op = buildOperation(doc, method, path, obj(item[method]));
      const tag = str(arr(obj(item[method]).tags)[0], "Other");
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push(op);
    }
  }

  // Order groups by the declared tag list; append any untagged bucket last.
  const groups: ApiGroup[] = [];
  for (const t of tags) {
    const name = str(t.name);
    const ops = byTag.get(name);
    if (ops?.length) groups.push({ tag: name, description: str(t.description), operations: ops });
  }
  const known = new Set(tags.map((t) => str(t.name)));
  for (const [tag, ops] of byTag) {
    if (!known.has(tag)) groups.push({ tag, description: "", operations: ops });
  }

  const schemas: ApiSchema[] = Object.entries(obj(obj(doc.components).schemas)).map(([name, raw]) => {
    const s = obj(raw);
    const required = new Set(arr(s.required).map(String));
    const fields: ApiSchemaField[] = Object.entries(obj(s.properties)).map(([field, propRaw]) => {
      const prop = obj(propRaw);
      return {
        name: field,
        type: typeLabel(prop),
        required: required.has(field),
        description: str(prop.description),
      };
    });
    return { name, description: str(s.description), fields };
  });

  return {
    info: { title: str(info.title), version: str(info.version), description: str(info.description) },
    servers: arr(doc.servers).map(obj).map((s) => ({ url: str(s.url), description: str(s.description) })),
    groups,
    schemas,
  };
}
