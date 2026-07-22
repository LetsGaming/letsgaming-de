import { ref } from "vue";
import { AuthError, cms, loadToken, setToken } from "../lib/cms";

/**
 * The CMS session: who's signed in, the toast, and the wrapper every write goes
 * through.
 *
 * The last of the three concerns lifted out of `useCms` (after `useCmsNav` and
 * `useCmsPreview`). It was the hardest to move because `guarded` sits at the
 * junction of all three — it toasts, it invalidates the preview, and an expired
 * token drops the session — which is exactly why it belongs behind a seam rather
 * than in the middle of a 682-line function.
 *
 * The two things it can't own are callbacks:
 *
 * - `loadContent` — what to fetch once the token checks out. That's the content
 *   model, which stays in `useCms`; a session module that imported it would pull
 *   the whole editor in behind it.
 * - `onSaved` — a successful write invalidates the live preview. The session
 *   doesn't know a preview exists, and shouldn't.
 *
 * Same shape as `useCmsNav`'s `onOpen`: the module owns the mechanism, the caller
 * owns what it means here.
 */
export function useCmsSession(opts: {
  /** Load everything the editor needs. Runs after a successful `cms.me()`. */
  loadContent: () => Promise<void>;
  /** Runs after any successful guarded write. */
  onSaved?: () => void;
}) {
  const authed = ref(false);
  const login = ref<string | null>(null);
  const loading = ref(true);
  const tokenInput = ref("");
  const toast = ref("");

  function flash(msg: string) {
    toast.value = msg;
    window.setTimeout(() => (toast.value = ""), 2200);
  }

  /**
   * Establish the session from a stored token.
   *
   * A rejected token is the ordinary case, not an error: it's what happens on
   * every first visit and every expiry, and the answer is the sign-in gate. So
   * the catch flips `authed` and says nothing — a toast here would fire on a
   * cold load, before the visitor has done anything to be told about.
   */
  async function boot() {
    loadToken();
    loading.value = true;
    try {
      const me = await cms.me();
      login.value = me.login;
      authed.value = true;
      await opts.loadContent();
    } catch {
      authed.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function signIn() {
    setToken(tokenInput.value);
    await boot();
    // Here a rejection *is* worth saying: someone just typed that token in.
    if (!authed.value) flash("That token was rejected.");
  }

  function signOut() {
    setToken(null);
    authed.value = false;
  }

  /**
   * Run a write, then toast or handle the failure.
   *
   * `Promise<unknown>`, not `Promise<void>`: now that the API client returns real
   * shapes instead of `any`, every `cms.put(…)` resolves to `{ ok: true }` — and a
   * `Promise<void>` parameter would have meant twenty call sites each wrapping
   * their own `void (await …)` to throw the value away. `guarded` doesn't read the
   * result; it should say so once rather than make everyone prove it.
   */
  async function guarded(fn: () => Promise<unknown>, ok = "Saved") {
    try {
      await fn();
      flash(ok);
      opts.onSaved?.();
    } catch (e) {
      if (e instanceof AuthError) {
        authed.value = false;
        flash("Session expired — sign in again.");
      } else {
        flash((e as Error).message || "Something went wrong.");
      }
    }
  }

  return { authed, login, loading, tokenInput, toast, flash, boot, signIn, signOut, guarded };
}
