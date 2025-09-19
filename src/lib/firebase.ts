// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
