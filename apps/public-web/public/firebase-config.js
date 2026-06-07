export const firebaseConfig = {
  apiKey: "AIzaSyA3OGzTgXz6sANFEmdaXgXv9m1S0-WygiE",
  authDomain: "rockeala.firebaseapp.com",
  projectId: "rockeala",
  storageBucket: "rockeala.firebasestorage.app",
  messagingSenderId: "541511852154",
  appId: "1:541511852154:web:d2c94c68a3afa6fff35bc3"
};

export const firebaseRuntime = {
  functionsRegion: "southamerica-east1"
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => (
    typeof value === "string"
    && value.length > 0
    && !value.startsWith("YOUR_")
  ));
}
