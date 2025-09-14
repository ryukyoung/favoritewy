import { useLocation, useNavigate } from "react-router-dom";
import CollageBoard from "../components/CollageBoard";
import CollageBoardSingle from "../components/CollageBoardSingle";
import type { RouteState } from "../types";
import { COLUMN_CONFIGS } from "../columnConfig";

const CELL = 160;
const GAP = 20;
const MARGINS = { top: 340, bottom: 160, side: 140 };
const IMG_COLS = COLUMN_CONFIGS.length;

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
      {state.layoutHint === "single" ? (
        <CollageBoardSingle
          participants={state.participants}
          titles={state.titles}
          cell={CELL}
          gap={GAP}
          margins={MARGINS}
        />
      ) : (
        <CollageBoard
          participants={state.participants}
          titles={state.titles}
          cell={CELL}
          gap={GAP}
          margins={MARGINS}
          imgCols={IMG_COLS}
        />
      )}
      <button onClick={() => nav("/")}>홈으로</button>
    </div>
  );
}
