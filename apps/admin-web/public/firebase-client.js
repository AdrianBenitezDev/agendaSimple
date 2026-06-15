import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { getAuth, getFunctions, getStorage, initializeApp, initializeFirestore } from "./firebase-sdk.js";

export const firebaseReady = isFirebaseConfigured();

const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
const firestoreSettings = {
  // Avoid WebChannel/QUIC transport issues seen in some browser/network combinations.
  experimentalForceLongPolling: true
};

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? initializeFirestore(firebaseApp, firestoreSettings) : null;
export const functions = firebaseApp ? getFunctions(firebaseApp, "southamerica-east1") : null;
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
