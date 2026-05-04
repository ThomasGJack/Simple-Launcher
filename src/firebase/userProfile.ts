import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getFirebase } from "./config";
import type { UserPrivacy } from "./presence";
import type { ProfileThemeId } from "@/lib/profileThemes";
import type { SupporterTier } from "@/lib/supporterTier";

/**
 * Persists user-editable profile fields to `/users/{uid}`. The presence
 * heartbeat (`pushHeartbeat`) merges into the same doc but uses a strict
 * subset of fields, so the two writers don't step on each other.
 */
export async function saveProfileCustomization(
  uid: string,
  patch: Partial<{
    bio: string | null;
    bannerUrl: string | null;
    accentColor: string | null;
    profileTheme: ProfileThemeId | null;
    pinnedModuleIds: string[];
    privacy: UserPrivacy;
  }>,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non configuré");
  await setDoc(
    doc(fb.db, "users", uid),
    { ...patch, profileUpdatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Uploads a banner image for the user's profile page to Firebase Storage
 * at `users/{uid}/profile/banner.{ext}` and returns the resulting public
 * download URL. Storage rules restrict writes to the owner only.
 */
export async function uploadProfileBanner(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non configuré");
  const ext = inferImageExt(file);
  const path = `users/${uid}/profile/banner${ext}`;
  const ref = storageRef(fb.storage, path);
  const task = uploadBytesResumable(ref, file, {
    contentType: file.type || "image/png",
    customMetadata: { uid, kind: "profile-banner" },
  });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (!onProgress) return;
        const percent =
          snap.totalBytes > 0 ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
        onProgress(percent);
      },
      reject,
      () => resolve(),
    );
  });
  return getDownloadURL(ref);
}

/**
 * Admin-only : set a user's supporter tier ("supporter" / "vip" /
 * "legend") or clear it (`null`). Used by the admin panel to manually
 * grant tiers until subscription payments are wired up. Firestore
 * rules let any authed user write their own profile, so technically a
 * user could elevate themselves — the admin panel is just the
 * intended UI. Once Stripe is in place we'll lock this down via a
 * Cloud Function + an `isAdmin()` rule on the `tier` field.
 */
export async function setUserTier(
  uid: string,
  tier: SupporterTier | null,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non configuré");
  await updateDoc(doc(fb.db, "users", uid), { tier });
}

function inferImageExt(file: File): string {
  const name = file.name.toLowerCase();
  for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".gif"]) {
    if (name.endsWith(ext)) return ext;
  }
  if (file.type.includes("png")) return ".png";
  if (file.type.includes("webp")) return ".webp";
  if (file.type.includes("jpeg")) return ".jpg";
  if (file.type.includes("gif")) return ".gif";
  return ".png";
}
