// components/CollageBoardSingle.tsx
import { useEffect, useMemo } from "react";
import type { Participant } from "../types";

type Props = {
  participants: Participant[];
  titles: string[]; // 길이 10 기준 (4+4+2)
  cell: number; // 셀 한 변 px
  gap: number; // 셀 간격 px
  margins?: { top: number; bottom: number; side: number };
  boardWidth?: number;
  boardHeight?: number;
};

const PATTERN = [4, 4, 2]; // ★ 4 / 4 / 2 고정
const MAX_COLS = 4; // 가장 긴 줄의 칸수

export default function CollageBoardSingle({
  participants,
  titles,
  cell,
  gap,
  margins = { top: 0, bottom: 0, side: 0 },
  boardWidth,
  boardHeight,
}: Props) {
  const rows = participants.length;

  // 누적합으로 인덱스→(줄,열) 변환
  const prefix = useMemo(() => {
    const p = [0];
    for (let i = 0; i < PATTERN.length; i++)
      p.push(p[p.length - 1] + PATTERN[i]);
    return p; // 길이 4 (0,4,8,10)
  }, []);

  const idxToWrap = (k: number) => {
    let r = 0;
    for (let i = 0; i < PATTERN.length; i++) {
      if (k >= prefix[i] && k < prefix[i + 1]) {
        r = i;
        break;
      }
    }
    const c = k - prefix[r];
    return { wr: r, wc: c };
  };

  // 크기 계산
  const gridW = MAX_COLS * cell + (MAX_COLS - 1) * gap;
  const perRowBlockH = PATTERN.length * cell + (PATTERN.length - 1) * gap; // 참가자 1명 높이
  const computedW = 2 * margins.side + gridW;
  const computedH =
    margins.top + margins.bottom + rows * perRowBlockH + (rows - 1) * gap;

  const W = boardWidth ?? computedW;
  const H = boardHeight ?? computedH;

  const gridStartX = margins.side;
  const rowYBase = (r: number) => margins.top + r * (perRowBlockH + gap);
  const colX = (c: number) => gridStartX + c * (cell + gap);

  // File → ObjectURL 맵
  const fileUrlMap = useMemo(() => {
    const m = new Map<File, string>();
    participants.forEach((p) =>
      (p.images || []).forEach((v) => {
        if (v instanceof File && !m.has(v)) m.set(v, URL.createObjectURL(v));
      })
    );
    return m;
  }, [participants]);

  useEffect(() => {
    return () => {
      fileUrlMap.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [fileUrlMap]);

  const getSrc = (v: unknown): string | null => {
    if (!v) return null;
    if (v instanceof File) return fileUrlMap.get(v) ?? null;
    if (typeof v === "string") return v;
    return null;
  };

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        background: "#fff",
        border: "1px solid #eee",
        boxSizing: "border-box",
      }}
    >
      {/* 닉네임(세 줄 블록 전체 높이 중앙 정렬) */}
      {participants.map((p, r) => (
        <div
          key={`nick-${r}`}
          style={{
            position: "absolute",
            left: 0,
            top: rowYBase(r),
            width: margins.side,
            height: perRowBlockH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 20,
          }}
          title={p.nickname}
        >
          {p.nickname}
        </div>
      ))}

      {/* 타이틀: 줄별 오프셋 */}
      {PATTERN.map((count, pr) =>
        Array.from({ length: count }, (_, c) => {
          const idx = prefix[pr] + c;
          if (idx >= titles.length) return null;
          return (
            <div
              key={`title-${pr}-${c}`}
              style={{
                position: "absolute",
                left: colX(c),
                top: Math.max(0, margins.top - 28) + pr * (cell + gap),
                width: cell,
                height: 24,
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {titles[idx]}
            </div>
          );
        })
      )}

      {/* 이미지 셀 */}
      {participants.map((p, r) =>
        Array.from(
          { length: Math.min(titles.length, prefix[PATTERN.length]) },
          (_, k) => {
            const { wr, wc } = idxToWrap(k);
            const src = getSrc(p.images?.[k]);
            return (
              <div
                key={`cell-${r}-${k}`}
                style={{
                  position: "absolute",
                  left: colX(wc),
                  top: rowYBase(r) + wr * (cell + gap),
                  width: cell,
                  height: cell,
                  boxSizing: "border-box",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fafafa",
                  overflow: "hidden",
                }}
              >
                {src ? (
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: "#aaa" }}>No Image</span>
                )}
              </div>
            );
          }
        )
      )}
    </div>
  );
}
