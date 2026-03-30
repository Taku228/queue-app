import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

const cleanEnv = (value: string | undefined) => {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
};

const rawConfig = {
  apiKey: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

export const isFirebaseConfigured = Object.values(rawConfig).every(
  (value) => value.length > 0
);

const firebaseConfig = {
  apiKey: rawConfig.apiKey || "AIzaSyCP2iL33pidZsvZ5f95Q3BZ3Fc4PUCOo_c",
  authDomain: rawConfig.authDomain || "queue-app-7cd3a.firebaseapp.com",
  projectId: rawConfig.projectId || "queue-app-7cd3a",
  storageBucket: rawConfig.storageBucket || "queue-app-7cd3a.firebasestorage.app",
  messagingSenderId: rawConfig.messagingSenderId || "102302129579",
  appId: rawConfig.appId || "1:102302129579:web:12a69f6aaf02f3f0dc86ee",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let firebaseInitError = "";

try {
  dbInstance = getFirestore(app);
} catch (error) {
  firebaseInitError =
    error instanceof Error ? error.message : "Firestoreの初期化に失敗しました。";
}

if (typeof window !== "undefined") {
  try {
    authInstance = getAuth(app);
  } catch (error) {
    firebaseInitError =
      error instanceof Error ? error.message : "Authの初期化に失敗しました。";
  }
}

export const db: Firestore = dbInstance ?? ({} as Firestore);
export const auth: Auth = authInstance ?? ({} as Auth);
export const firebaseClientInitError = firebaseInitError;
