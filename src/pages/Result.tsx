import { useLocation, useNavigate } from "react-router-dom";
import CollageBoard from "../components/CollageBoard";
import type { RouteState } from "../types";

export default function Result() {
  const nav = useNavigate();
  const loc = useLocation();
  const state = (loc.state || {}) as RouteState;

  if (!state?.participants?.length) {
    return (
      <div style={{ padding: 24 }}>
        <p>데이터가 없습니다. 홈으로 돌아가세요.</p>
        <button onClick={() => nav("/")}>홈으로</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <h2>결과</h2>
      <CollageBoard
        mode={state.mode}
        participants={state.participants}
        titles={state.titles}
      />
      <button onClick={() => nav("/")}>홈으로</button>
    </div>
  );
}
