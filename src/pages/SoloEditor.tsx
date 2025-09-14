import { useMemo, useState, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartImageCell from "../components/SmartImageCell";
import type { Participant } from "../types";
import { COLUMN_CONFIGS } from "../columnConfig";
import CollageBoardSingle from "../components/CollageBoardSingle";

// === Solo 전용: 총 10칸 ===
const SOLO_COLS = 10; // 10개 고정
const CELL = 160;
const GAP = 20;
const SIDE = 140;
const TOP = 340;
const BOTTOM = 160;

// ★ 미리보기는 4/4/2로 보일 것이므로, '최대 4열' 기준으로 보드 크기 계산
const PREVIEW_WRAP = [4, 4, 2];
const PREVIEW_MAX_COLS = 4;
const PREVIEW_BOARD_W =
  2 * SIDE + (PREVIEW_MAX_COLS * CELL + (PREVIEW_MAX_COLS - 1) * GAP);
const PREVIEW_PER_BLOCK_H =
  PREVIEW_WRAP.length * CELL + (PREVIEW_WRAP.length - 1) * GAP;
const PREVIEW_BOARD_H = TOP + BOTTOM + PREVIEW_PER_BLOCK_H; // 참가자 1명

export default function SoloEditor() {
  // 1) SOLO용 칸 설정: COLUMN_CONFIGS에서 10개로 맞추고, 모자라면 업로드로 채움
  const SOLO_CONFIGS = useMemo(() => {
    const out = [...COLUMN_CONFIGS].slice(0, SOLO_COLS);
    while (out.length < SOLO_COLS) {
      out.push({ title: `항목 ${out.length + 1}`, mode: "upload" } as any);
    }
    return out;
  }, []);

  // 2) 타이틀 자동 추출(10개)
  const titles = useMemo(
    () => SOLO_CONFIGS.map((c) => c.title),
    [SOLO_CONFIGS]
  );

  // 3) 단일 참가자 상태
  const [nickname, setNickname] = useState("닉네임");
  const [images, setImages] = useState<(File | string | null)[]>(
    Array(SOLO_COLS).fill(null)
  );
  const participant: Participant = useMemo(
    () => ({ nickname, images }),
    [nickname, images]
  );

  const onChangeImage = (idx: number, v: File | string | null) => {
    setImages((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
  };

  // 5) 미리보기 배율 (★ 4열 보드 폭 기반)
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  useLayoutEffect(() => {
    const handleResize = () => {
      const wrap = previewWrapRef.current;
      if (!wrap) return;
      const available = wrap.clientWidth - 8;
      const fit = available / PREVIEW_BOARD_W;
      const s = Math.min(1, Math.max(0.6, fit));
      setPreviewScale(s);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // === 선택창 분배: 3,3,3,1 (총 10칸) ===
  const row1 = [0, 1, 2];
  const row2 = [3, 4, 5];
  const row3 = [6, 7, 8];
  const row4 = [9]; // ★ 인덱스 10 제거 (범위 초과 방지)

  const renderRow = (idxs: number[], cols: number) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 10,
      }}
    >
      {idxs.map((i) => {
        const cfg = SOLO_CONFIGS[i];
        return (
          <div
            key={i}
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
              value={images[i]}
              onChange={(v) => onChangeImage(i, v)}
              config={cfg}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>1인 편집</h2>

      {/* 위: 입력 / 아래: 미리보기 */}
      <section style={{ display: "grid", gap: 16 }}>
        {/* 닉네임 */}
        <div>
          <label style={{ fontSize: 14, display: "block", marginBottom: 6 }}>
            닉네임
          </label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 16,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />
        </div>

        {/* 선택 그리드: 3 / 3 / 3 / 1 */}
        <div style={{ display: "grid", gap: 12 }}>
          {renderRow(row1, 3)}
          {renderRow(row2, 3)}
          {renderRow(row3, 3)}
          {renderRow(row4, 1)}
        </div>
      </section>

      {/* 미리보기: 4/4/2 보드 */}
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
            width: PREVIEW_BOARD_W * previewScale,
            height: PREVIEW_BOARD_H * previewScale,
            position: "relative",
          }}
        >
          <div
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
              width: PREVIEW_BOARD_W,
              height: PREVIEW_BOARD_H,
            }}
          >
            <CollageBoardSingle
              participants={[participant]}
              titles={titles} // 10개
              cell={CELL}
              gap={GAP}
              margins={{ top: TOP, bottom: BOTTOM, side: SIDE }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
