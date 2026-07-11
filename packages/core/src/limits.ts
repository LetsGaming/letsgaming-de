/**
 * Field length limits, defined once and shared by both sides of every form:
 * the browser inputs (`maxlength`) and the server's request-body validation
 * (`maxLength`). Previously these integers were written twice — in the Vue
 * templates and in the route schemas — and could silently drift.
 */
export const FIELD_LIMITS = {
  contactName: 120,
  contactEmail: 200,
  contactMessage: 5000,
  guestbookName: 60,
  guestbookMessage: 1000,
} as const;

export type FieldLimit = (typeof FIELD_LIMITS)[keyof typeof FIELD_LIMITS];
