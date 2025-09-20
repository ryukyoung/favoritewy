import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

const logo = "../assets/logo.png";

export default function Home() {
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);

  const startMulti = async () => {
    try {
      setCreating(true);

      // ✅ 익명 로그인 보장
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      const roomId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

      await setDoc(doc(db, "rooms", roomId), {
        titles: [],
        participants: [],
        ownerUid: auth.currentUser?.uid ?? null, // 선택
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      nav(`/multi/${roomId}`);
    } catch (e) {
      console.error("create room failed:", e);
      alert(
        "방 만들기에 실패했어요. 콘솔과 Firestore 규칙/인증 설정을 확인해 주세요."
      );
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: "0 16px",
        boxSizing: "border-box",
      }}
    >
      {/* 중앙 래퍼: 실제 가로폭 확보 */}
      <div
        style={{
          transform: "translateY(10px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          maxWidth: 520, // ✅ 원하는 최대 폭
          boxSizing: "border-box", // ✅ 패딩 포함 계산
        }}
      >
        <img src={logo} alt="logo" />

        {/* 버튼 행 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "stretch",
            flexDirection: "row",
            width: "100%", // ✅ 래퍼 기준 100%
            gap: 16, // (선택) 간격 더 자연스럽게
          }}
        >
          {/* 동일 폭을 원하면 flex:1 사용 */}
          <button
            onClick={() => nav("/solo")}
            style={{
              flex: 1, // ✅ 두 버튼 동일폭
              padding: "12px 12px",
              background: "#ff7ed0",
              color: "#fff",
              borderRadius: 10,
              border: 0,
              fontWeight: 500,
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            1인(혼자 만들기)
          </button>

          <button
            onClick={startMulti}
            disabled={creating}
            style={{
              flex: 1, // ✅ 두 버튼 동일폭
              padding: "12px 12px",
              background: "#ff7ed0",
              color: "#fff",
              borderRadius: 10,
              border: 0,
              fontWeight: 500,
              fontSize: 16,
              opacity: creating ? 0.8 : 1,
              cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "방 만드는 중..." : "다인(함께 만들기)"}
          </button>
        </div>
        <button
          onClick={() => nav("/manual")}
          style={{
            background: "#fff",
            color: "#000",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontWeight: 500,
            cursor: "pointer",
            fontSize: 16,
            width: "100%",
            marginTop: -30,
          }}
        >
          사용 방법
        </button>
      </div>

      {/* 하단 저작권 문구 */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 12,
          color: "#999",
          pointerEvents: "none",
        }}
      >
        X @ghbgif
      </div>
    </div>
  );
}
