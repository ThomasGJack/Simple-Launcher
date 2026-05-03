import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getFirebase } from "./config";
import type { CrashCollectSnapshot } from "@/lib/mcCrash";

/**
 * Persists a crash snapshot to `/crashReports/{auto-id}` for remote
 * debugging. The admin can then look at the report from the admin panel
 * (or via Firestore console for now) without having to ask the user to
 * copy-paste files from their disk.
 *
 * Privacy note : the report includes the tail of `logs/latest.log` and
 * up to 3 crash-reports stack traces, both of which can include the
 * user's username + world name + chat history if MC happened to log it.
 * The user explicitly clicks "Envoyer à l'admin" — never automatic.
 *
 * Firestore rules (see firestore.rules) restrict reads to admins; the
 * write side allows any authenticated user to create one for themselves.
 */
export type RemoteCrashReport = {
  uid: string;
  /** Discord display name at time of crash, for quick triage. */
  userName: string;
  /** Module / instance whose launch crashed. */
  moduleId: string;
  moduleName: string;
  /** Native exit code (-1 / 1 / 137 / 0xc000... — anything != 0). */
  exitCode: number;
  /** Last in-memory console lines from the launch panel, useful for
   *  catching the moment of crash even if MC didn't flush its log. */
  lastConsoleLines: string;
  /** Captured tail + crash-reports from `mcCrashCollect`. */
  snapshot: CrashCollectSnapshot;
  /** Optional free-text the user wrote in the modal ("ça a freeze quand
   *  je suis entré dans le nether"). */
  userNote?: string;
  /** Launcher version at time of crash. */
  launcherVersion: string;
  /** Module's pinned MC version + loader, when known. */
  mcVersion?: string;
  loader?: string;
};

export async function sendCrashReport(report: Omit<RemoteCrashReport, "createdAt">): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase non initialisé");
  const docRef = await addDoc(collection(fb.db, "crashReports"), {
    ...report,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
