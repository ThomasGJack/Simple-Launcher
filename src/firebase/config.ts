import { initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

export function getFirebase() {
  if (!app) {
    if (!firebaseConfig.apiKey) {
      console.warn("[firebase] config not set — running in offline/dev mode");
      return null;
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch((err) =>
      console.warn("[firebase] persistence failed:", err),
    );
    // Enable Firestore offline persistence with IndexedDB-backed cache.
    // Tauri runs as a single-window, single-tab app — `persistentSingleTabManager`
    // is the cheapest tab manager (no cross-tab coordination overhead).
    //
    // Effects :
    //  - Cold/warm boot reads come from cache instantly (no round-trip
    //    before the first paint).
    //  - When offline (mode hors ligne), all reads succeed against the
    //    cache. Writes queue and sync when the network comes back.
    //  - Cache is automatically pruned (Firebase manages its own LRU).
    //
    // `initializeFirestore` must be called before the first `getFirestore`
    // — we do it here at first init so it's the only entry point.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(undefined),
      }),
    });
    storage = getStorage(app);
    functions = getFunctions(app, "europe-west1");
  }
  return { app, auth: auth!, db: db!, storage: storage!, functions: functions! };
}
