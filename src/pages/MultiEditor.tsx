import { useMemo, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import CollageBoard from "../components/CollageBoard";
// import ImageCell from "../components/ImageCell"; // ← 이 파일에선 미사용이면 지워도 OK
import type { Participant, RouteState } from "../types";
import SmartImageCell from "../components/SmartImageCell";
import { COLUMN_CONFIGS } from "../columnConfig"; // ← GRID_ROWS는 여기서 들고오지 않음(로컬에서 3으로 고정)

const IMG_COLS = COLUMN_CONFIGS.length; // 10
const GRID_ROWS = 4; // 모바일 요구사항: 3줄
const GRID_COLS = Math.ceil(IMG_COLS / GRID_ROWS);

// 타이틀은 config에서 직접 가져오면 안전
const DEFAULT_TITLES = COLUMN_CONFIGS.map((c) => c.title);

// ===== 결과 규격(보드는 그대로 유지) =====
const CELL = 160;
const GAP = 20;
const SIDE = 140;
const TOP = 340;
const BOTTOM = 160;

const GRID_W = IMG_COLS * CELL + (IMG_COLS - 1) * GAP;
const BOARD_W = 2 * SIDE + GRID_W;

export default function MultiEditor() {
  const nav = useNavigate();

  const [count, setCount] = useState(2);
  const titles = DEFAULT_TITLES;

  const [participants, setParticipants] = useState<Participant[]>(
    Array.from({ length: count }, (_, i) => ({
      nickname: `User${i + 1}`,
      images: Array(IMG_COLS).fill(null),
    }))
  );

  const onChangeCount = (n: number) => {
    const c = Math.max(2, Math.min(10, Math.floor(n) || 2));
    setCount(c);
    setParticipants((prev) => {
      const next = [...prev];
      if (next.length < c) {
        while (next.length < c) {
          next.push({
            nickname: `User${next.length + 1}`,
            images: Array(IMG_COLS).fill(null),
          });
        }
      } else if (next.length > c) {
        next.length = c;
      }
      return next;
    });
  };

  const updateNickname = (idx: number, name: string) => {
    setParticipants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], nickname: name };
      return next;
    });
  };

  // SmartImageCell이 File | string | null을 넘기므로 시그니처를 넓혀줌
  const updateImage = (
    idx: number,
    imgIdx: number,
    v: File | string | null
  ) => {
    setParticipants((prev) => {
      const next = [...prev];
      const imgs = [...(next[idx].images || [])];
      imgs[imgIdx] = v as any;
      next[idx] = { ...next[idx], images: imgs };
      return next;
    });
  };

  const goResult = () => {
    const state: RouteState = {
      mode: "multi",
      participants,
      titles,
    };
    nav("/result", { state });
  };

  const previewData = useMemo(() => participants, [participants]);

  const boardHeight = useMemo(() => {
    return TOP + BOTTOM + count * CELL + (count - 1) * GAP;
  }, [count]);

  // ===== 미리보기 배율: 너무 작아지지 않도록 최소값 보장(예: 0.6) =====
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useLayoutEffect(() => {
    const handleResize = () => {
      const wrap = previewWrapRef.current;
      if (!wrap) return;
      const available = wrap.clientWidth - 8;
      const fit = available / BOARD_W;
      const s = Math.min(1, Math.max(0.6, fit));
      setPreviewScale(s);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [boardHeight]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>다인 편집</h2>

      {/* ===== 모바일: 위(선택) / 아래(미리보기) ===== */}
      <section style={{ display: "grid", gap: 16 }}>
        {/* 인원 수 */}
        <div>
          <label style={{ fontSize: 14, display: "block", marginBottom: 6 }}>
            인원 수 (2~10)
          </label>
          <input
            type="number"
            min={2}
            max={10}
            value={count}
            onChange={(e) => onChangeCount(Number(e.target.value))}
            style={{
              width: 140,
              padding: "12px 14px",
              fontSize: 16,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />
        </div>

        {/* 참가자 행 에디터 */}
        <div style={{ display: "grid", gap: 20 }}>
          {participants.map((p, i) => (
            <div
              key={i}
              style={{ paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}
            >
              {/* 닉네임 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <strong style={{ width: 48, fontSize: 14 }}>{i + 1}번</strong>
                <input
                  value={p.nickname}
                  onChange={(e) => updateNickname(i, e.target.value)}
                  placeholder="닉네임"
                  style={{
                    padding: "12px 14px",
                    fontSize: 16,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    flex: 1,
                  }}
                />
              </div>

              {/* 3행 그리드 + 라벨 + 스마트 셀 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                  gap: 10,
                }}
              >
                {Array.from({ length: IMG_COLS }, (_, j) => {
                  const cfg = COLUMN_CONFIGS[j];
                  return (
                    <div
                      key={j}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          padding: "2px 2px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={cfg.title}
                      >
                        {cfg.title}
                      </div>

                      <SmartImageCell
                        value={p.images[j]}
                        onChange={(v) => updateImage(i, j, v)}
                        size={120}
                        config={cfg}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* ★★★ 여기 닫는 </div>가 반드시 필요합니다 ★★★ */}
      </section>

      {/* 액션 버튼 */}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={goResult}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
          }}
        >
          결과 화면으로
        </button>
      </div>

      {/* 미리보기 */}
      <section
        ref={previewWrapRef}
        style={{
          marginTop: 20,
          width: "100%",
          overflow: "auto",
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 6,
          boxSizing: "border-box",
          background: "#fff",
        }}
      >
        <div
          style={{
            width: BOARD_W * previewScale,
            height: boardHeight * previewScale,
            position: "relative",
          }}
        >
          <div
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
              width: BOARD_W,
              height: boardHeight,
            }}
          >
            <CollageBoard
              mode="multi"
              participants={previewData}
              titles={titles}
              cell={CELL}
              gap={GAP}
              margins={{ top: TOP, bottom: BOTTOM, side: SIDE }}
              imgCols={IMG_COLS}
              boardWidth={BOARD_W}
              boardHeight={boardHeight}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
