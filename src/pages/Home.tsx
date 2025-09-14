// src/pages/Home.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Home() {
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);

  const startMulti = async () => {
    try {
      setCreating(true);
      // 20자 정도의 짧은 랜덤 ID
      const roomId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

      // 방 문서 초기화(비어 있어도 OK)
      await setDoc(doc(db, "rooms", roomId), {
        titles: [], // 필요하면 기본 타이틀 넣기
        participants: [], // 빈 참가자 목록
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      nav(`/multi/${roomId}`);
    } catch (e) {
      console.error(e);
      alert("방 만들기에 실패했어요. Firestore 설정/권한을 확인해 주세요.");
      setCreating(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: 24 }}>이미지 콜라주 메이커</h1>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => nav("/solo")} style={{ padding: "10px 16px" }}>
            1인(혼자 만들기)
          </button>
          <button
            onClick={startMulti}
            disabled={creating}
            style={{ padding: "10px 16px", opacity: creating ? 0.6 : 1 }}
          >
            {creating ? "방 만드는 중..." : "다인(여러 명 함께)"}
          </button>
        </div>
      </div>
    </div>
  );
}
