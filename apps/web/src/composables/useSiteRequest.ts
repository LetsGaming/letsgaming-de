import { STORAGE_KEY, type Locale } from "@lg/core";
import { chooseRequestLang } from "~/lib/text";

/** The locale the last area page rendered in. Unlike `useLocale()`, which always
 *  holds a value (it defaults to English), this is `null` until an area page has
 *  actually rendered, so "nothing rendered yet" can be told apart from "English". */
export function useRenderedLocale() {
  return useState<Locale | null>("site-rendered-locale", () => null);
}

/** The `lang` to send with this page's `/api/site` request. See {@link chooseRequestLang}. */
export function useRequestLang(): Locale | string | undefined {
  const route = useRoute();
  const queryLang = route.query.lang;
  const explicit = Array.isArray(queryLang) ? queryLang[0] : queryLang;

  let stored: string | null = null;
  if (import.meta.client) {
    try {
      stored = localStorage.getItem(STORAGE_KEY.lang);
    } catch {
      /* private mode: nothing stored */
    }
  }

  return chooseRequestLang({
    explicit: typeof explicit === "string" ? explicit : null,
    hydrating: useNuxtApp().isHydrating === true,
    rendered: useRenderedLocale().value,
    stored,
  });
}
