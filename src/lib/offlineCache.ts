import type { User } from "firebase/auth";
import type { LauncherModule } from "@/types/module";

/**
 * LocalStorage-backed offline cache for the minimum data needed to
 * render a usable launcher when Firebase is unreachable.
 *
 * Two slots:
 *  - "offline.user" : a serialized snapshot of the Firebase Auth user
 *    (uid, displayName, photoURL, email, providerData). Persisted post-
 *    login. Read at boot if `onAuthStateChanged` doesn't fire fast
 *    enough.
 *  - "offline.modules" : the most recent `LauncherModule[]` snapshot
 *    received from the modules Firestore listener. Persisted on every
 *    snapshot, read at boot if the listener never fires (offline).
 *
 * Sizes are bounded — the user blob is ~300 B, the modules array is
 * O(N modules × ~2 KB metadata) = a few hundred KB at most. Well
 * within the 5 MB localStorage quota.
 */

const KEY_USER = "offline.user.v1";
const KEY_MODULES = "offline.modules.v1";

export type CachedUser = {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
};

export function saveCachedUser(user: CachedUser | null): void {
  try {
    if (user === null) {
      localStorage.removeItem(KEY_USER);
    } else {
      localStorage.setItem(KEY_USER, JSON.stringify(user));
    }
  } catch {
    // Storage full / disabled — non-fatal, offline mode just won't have
    // a cached user on next boot.
  }
}

export function loadCachedUser(): CachedUser | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.uid === "string" &&
      parsed.uid.length > 0
    ) {
      return {
        uid: parsed.uid,
        displayName:
          typeof parsed.displayName === "string" ? parsed.displayName : null,
        photoURL: typeof parsed.photoURL === "string" ? parsed.photoURL : null,
        email: typeof parsed.email === "string" ? parsed.email : null,
      };
    }
  } catch {
    // Parse error — corrupted cache, drop it.
  }
  return null;
}

export function saveCachedModules(modules: LauncherModule[]): void {
  try {
    localStorage.setItem(KEY_MODULES, JSON.stringify(modules));
  } catch {
    // Quota exceeded — strip the heaviest fields and retry once. Page
    // (rich block JSON) and bannerUrl are the largest contributors;
    // offline rendering can live without them.
    try {
      const slim = modules.map((m) => ({ ...m, page: undefined }));
      localStorage.setItem(KEY_MODULES, JSON.stringify(slim));
    } catch {
      /* still too big — give up rather than blow the quota */
    }
  }
}

export function loadCachedModules(): LauncherModule[] {
  try {
    const raw = localStorage.getItem(KEY_MODULES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as LauncherModule[];
  } catch {
    // Parse error — corrupted cache, drop it.
  }
  return [];
}

export function clearOfflineCache(): void {
  try {
    localStorage.removeItem(KEY_USER);
    localStorage.removeItem(KEY_MODULES);
  } catch {
    /* non-fatal */
  }
}

/**
 * Adapt a `CachedUser` blob to the `firebase/auth` `User` shape so the
 * rest of the codebase (which is typed against `User`) can treat it
 * uniformly. Only the read-only fields actually consumed by the UI are
 * populated — methods like `getIdToken` / `delete` / `reload` would
 * fail on the network layer anyway in offline mode, so we leave them
 * as stubs that throw a clear error.
 */
export function cachedUserAsFirebaseUser(c: CachedUser): User {
  const offlineThrow = () => {
    throw new Error("Operation requires network — currently offline");
  };
  return {
    uid: c.uid,
    displayName: c.displayName,
    photoURL: c.photoURL,
    email: c.email,
    emailVerified: false,
    isAnonymous: false,
    metadata: { creationTime: undefined, lastSignInTime: undefined },
    phoneNumber: null,
    providerData: [],
    providerId: "offline",
    refreshToken: "",
    tenantId: null,
    delete: offlineThrow,
    getIdToken: offlineThrow,
    getIdTokenResult: offlineThrow,
    reload: offlineThrow,
    toJSON: () => ({ ...c }),
  } as unknown as User;
}

export function firebaseUserAsCached(u: User): CachedUser {
  return {
    uid: u.uid,
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    email: u.email ?? null,
  };
}
