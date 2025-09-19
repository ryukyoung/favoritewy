import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBFaQ8-NsD6gKs-sKvFf6hckgByIN3jfII",
  authDomain: "wyfavorite-f73e6.firebaseapp.com",
  projectId: "wyfavorite-f73e6",
  storageBucket: "wyfavorite-f73e6.appspot.com",
  messagingSenderId: "405918819454",
  appId: "1:405918819454:web:afc0dde91950cb1831e42f",
  measurementId: "G-GV41STR0Y6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// 브라우저일 때 익명 로그인 시도
if (typeof window !== "undefined") {
  signInAnonymously(auth).catch((e) => {
    console.error("Anonymous sign-in failed:", e);
  });
}

export const analyticsPromise = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);
