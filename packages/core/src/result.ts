/**
 * A typed success/failure value for operations that can fail as part of normal
 * operation — e.g. hitting an external API. Preferred over throwing for expected
 * failures: the caller must handle both branches, and a slow/unavailable upstream
 * is normal, not exceptional (see the external-integrations standard).
 */
export type Result<T, E = SourceError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** How a source fetch failed. Transport kinds come from the shared client; */
/** `upstream` is an adapter-level logical failure (bad payload, API error). */
export type SourceErrorKind = "timeout" | "http" | "network" | "parse" | "upstream";

export interface SourceError {
  kind: SourceErrorKind;
  message: string;
  /** Present when kind === "http". */
  status?: number;
}

export const sourceError = (kind: SourceErrorKind, message: string, status?: number): SourceError =>
  status === undefined ? { kind, message } : { kind, message, status };
