// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBFaQ8-NsD6gKs-sKvFf6hckgByIN3jfII",
  authDomain: "wyfavorite-f73e6.firebaseapp.com",
  projectId: "wyfavorite-f73e6",
  storageBucket: "wyfavorite-f73e6.firebasestorage.app",
  messagingSenderId: "405918819454",
  appId: "1:405918819454:web:afc0dde91950cb1831e42f",
  measurementId: "G-GV41STR0Y6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// ❶ 로그인 보장 함수
export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.error("Anonymous sign-in failed:", e);
    throw e;
  }
  // onAuthStateChanged가 실제 사용자 설정될 때까지 한 번 기다림
  await new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
  return auth.currentUser;
}

// ❷ 페이지 로드시 미리 시도(선택) — 실패해도 무시
if (typeof window !== "undefined") {
  ensureSignedIn().catch(() => {});
}

export const analyticsPromise = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);
