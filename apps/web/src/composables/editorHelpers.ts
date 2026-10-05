import type { Localized, ModuleDescriptor } from "@lg/core";

const LAST_PAGE_KEY = "lg.cms.editor.page";

export function readLastPage(): string | null {
  try {
    return localStorage.getItem(LAST_PAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastPage(id: string): void {
  try {
    localStorage.setItem(LAST_PAGE_KEY, id);
  } catch {
    /* storage can be blocked; the editor just reopens on the first page */
  }
}

/**
 * Whether a module has English text that the given content locale lacks.
 * An English-only module can't be "missing" anything, and a field whose English is
 * empty has nothing to translate.
 */
export function missingTranslation(
  m: Pick<ModuleDescriptor, "heading" | "note"> | undefined,
  locale: string,
): boolean {
  if (!m || locale === "en") return false;
  const lacks = (l?: Localized) => !!l && !!l.en?.trim() && !(l as Record<string, string | undefined>)[locale]?.trim();
  return lacks(m.heading) || lacks(m.note);
}

/** True when keystrokes belong to a text control, so shortcuts must stay quiet. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return false;
  return (
    e.isContentEditable === true ||
    e.tagName === "INPUT" ||
    e.tagName === "TEXTAREA" ||
    e.tagName === "SELECT"
  );
}

export type ShortcutAction = "palette" | "help" | "move-up" | "move-down" | "remove" | "deselect";

/**
 * Maps a key event to an editor action. Ctrl/Cmd+K is the only chord that fires
 * while typing: it can't be confused with text entry and it's how you leave a field.
 */
export function shortcutFor(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target">,
): ShortcutAction | null {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") return "palette";
  if (isTypingTarget(e.target)) return null;
  if (e.altKey && e.key === "ArrowUp") return "move-up";
  if (e.altKey && e.key === "ArrowDown") return "move-down";
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "?") return "help";
  if (e.key === "Delete") return "remove";
  if (e.key === "Escape") return "deselect";
  return null;
}

export interface PaletteItem {
  id: string;
  label: string;
  group: "Page" | "Module" | "Action";
  run: () => void;
}

/** Every whitespace-separated term must appear in the label; empty query keeps all. */
export function filterPalette<T extends { label: string }>(items: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((i) => {
    const hay = i.label.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
