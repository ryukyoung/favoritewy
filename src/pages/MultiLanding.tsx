import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function MultiLanding() {
  const nav = useNavigate();

  const createRoom = async () => {
    const roomId = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    // 방 문서 초기화
    await setDoc(doc(db, "rooms", roomId), {
      titles: [], // 필요하면 기본 타이틀 세팅
      participants: [], // 빈 참가자 목록
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    nav(`/multi/${roomId}`);
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>멀티 에디터</h2>
      <button onClick={createRoom}>방 만들기</button>
    </div>
  );
}
