// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBFaQ8-NsD6gKs-sKvFf6hckgByIN3jfII",
  authDomain: "wyfavorite-f73e6.firebaseapp.com",
  projectId: "wyfavorite-f73e6",
  storageBucket: "wyfavorite-f73e6.appspot.com",
  messagingSenderId: "405918819454",
  appId: "1:405918819454:web:afc0dde91950cb1831e42f",
  measurementId: "G-GV41STR0Y6",
};
// 중복 초기화 방지
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ named export로 내보내기
export const db = getFirestore(app);
export const storage = getStorage(app);

// (옵션) analytics가 가능한 환경에서만 로드
export const analyticsPromise = isSupported()
  .then((ok) => (ok ? getAnalytics(app) : null))
  .catch(() => null);
