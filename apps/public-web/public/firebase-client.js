import { firebaseConfig, firebaseRuntime, isFirebaseConfigured } from "./firebase-config.js";
import { getFunctions, initializeApp, initializeFirestore } from "./firebase-sdk.js";

export const firebaseReady = isFirebaseConfigured();

const firebaseApp = firebaseReady ? initializeApp(firebaseConfig) : null;
const firestoreSettings = {
  // Avoid WebChannel/QUIC transport issues seen in some browser/network combinations.
  experimentalForceLongPolling: true
};

export const db = firebaseApp ? initializeFirestore(firebaseApp, firestoreSettings) : null;
export const functionsClient = firebaseApp ? getFunctions(firebaseApp, firebaseRuntime.functionsRegion) : null;
