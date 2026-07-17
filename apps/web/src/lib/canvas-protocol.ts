/**
 * The wire between the CMS and its editor canvas.
 *
 * The canvas is a separate document (`/admin/canvas`) for two reasons that happen
 * to agree.
 *
 * 1. **Fidelity.** The canvas renders the site's real section components. Inside
 *    the CMS they'd be styled by the CMS: `app.css` has `.card` at (0,1,0) and
 *    `cms.css` has `.cms .card` at (0,2,0), so every card on the canvas would wear
 *    admin styling. A preview that shows you the wrong thing is worse than none —
 *    you'd trust it. A separate document loads `app.css` and not `cms.css`. It
 *    also has its own width, so the preview can be narrowed to see the mobile
 *    layout, which a div in the admin grid can't.
 *
 * 2. **Exposure.** The canvas document is prerendered and holds *no data* — it
 *    ships an empty shell to anyone who opens `/admin/canvas`, and only becomes
 *    the site once an authenticated parent posts state into it. Unpublished
 *    layout, hidden modules and draft content never touch a public route. The
 *    alternative — teaching the real site an edit mode behind `?preview=1` — would
 *    have put edit affordances and unpublished content one query parameter away
 *    from every visitor.
 *
 * The canvas never calls the API. It can't: it has no session and no origin to
 * call. Everything it knows arrived through here.
 */

import type { SiteView } from "@lg/core";

/** Parent → canvas: render this. */
export interface CanvasRenderMessage {
  type: "canvas:render";
  site: SiteView;
  area: string;
  /** Draw the drag affordances. False renders a plain preview. */
  editing: boolean;
  /** The module outlined as selected, if any. */
  selected?: string;
}

/** Canvas → parent: a module was dragged to a new position on this page. */
export interface CanvasMoveMessage {
  type: "canvas:move";
  area: string;
  oldIndex: number;
  newIndex: number;
}

/** Canvas → parent: a module was clicked — open its editor. */
export interface CanvasSelectMessage {
  type: "canvas:select";
  moduleId: string;
}

/** Canvas → parent: the `+` between two modules was pressed. */
export interface CanvasInsertMessage {
  type: "canvas:insert";
  area: string;
  /** Where a chosen module should land. */
  index: number;
}

/** Canvas → parent: mounted and listening. Sent because the parent can't know
 *  when a `client:only` island inside an iframe is ready, and posting before then
 *  is a message into the void — the classic "works on the second click" bug. */
export interface CanvasReadyMessage {
  type: "canvas:ready";
}

export type ToCanvas = CanvasRenderMessage;
export type FromCanvas =
  | CanvasMoveMessage
  | CanvasSelectMessage
  | CanvasInsertMessage
  | CanvasReadyMessage;

/** Where the canvas document lives. Both ends need it; only one should spell it. */
export const CANVAS_PATH = "/admin/canvas";

/**
 * Accept a message only from our own origin.
 *
 * `postMessage` is receivable by anything that can reach the window, so an
 * unchecked handler is an open door: the canvas would render a `SiteView` handed
 * to it by any page that framed it, and the parent would act on "moves" from
 * anywhere. Same-origin is the whole trust model here — there's no token to check
 * because there's nothing to protect *in* the canvas, only the parent's actions to
 * protect *from* it.
 */
export function isSameOrigin(event: MessageEvent): boolean {
  return event.origin === window.location.origin;
}

/** Narrow an inbound message. A shape check, not a cast: this crosses a document
 *  boundary, so it's as untrusted as anything off the network. */
export function isFromCanvas(data: unknown): data is FromCanvas {
  if (typeof data !== "object" || data === null) return false;
  const type = (data as { type?: unknown }).type;
  return (
    type === "canvas:move" ||
    type === "canvas:select" ||
    type === "canvas:insert" ||
    type === "canvas:ready"
  );
}

export function isToCanvas(data: unknown): data is ToCanvas {
  return (
    typeof data === "object" && data !== null && (data as { type?: unknown }).type === "canvas:render"
  );
}
