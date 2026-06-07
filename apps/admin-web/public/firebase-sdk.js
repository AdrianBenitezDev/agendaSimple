export { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
export {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
export {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
export {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js";
