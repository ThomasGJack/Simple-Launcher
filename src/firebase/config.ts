import { initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
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
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, "europe-west1");
  }
  return { app, auth: auth!, db: db!, storage: storage!, functions: functions! };
}
