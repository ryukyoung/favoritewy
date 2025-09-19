// components/CollageBoardSingle.tsx
import { useEffect, useMemo } from "react";
import type { Participant } from "../types";

type Props = {
  participants: Participant[];
  titles: string[]; // 길이 10 기준 (4+4+2)
  cell: number; // 셀 한 변 px
  gap: number; // 셀 간격 px
  // ✅ 좌우 분리
  margins?: { top: number; bottom: number; left: number; right: number };
  boardWidth?: number;
  boardHeight?: number;
  // ✅ 배경 선택에 따라 닉네임 색상 제어
  bgKey?: "bg1" | "bg2";
};

const PATTERN = [4, 4, 2]; // 4 / 4 / 2 고정
const MAX_COLS = 4; // 가장 긴 줄의 칸수

export default function CollageBoardSingle({
  participants,
  titles,
  cell,
  gap,
  margins = { top: 0, bottom: 0, left: 0, right: 0 }, // ✅ 기본값 변경
  boardWidth,
  boardHeight,
  bgKey = "bg1", // ✅ 기본값: bg1
}: Props) {
  const rows = participants.length; // Solo에선 보통 1

  // 누적합으로 인덱스→(줄,열) 변환
  const prefix = useMemo(() => {
    const p = [0];
    for (let i = 0; i < PATTERN.length; i++)
      p.push(p[p.length - 1] + PATTERN[i]);
    return p; // (0,4,8,10)
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

  // ===== 크기 계산 (좌우 분리) =====
  const gridW = MAX_COLS * cell + (MAX_COLS - 1) * gap;
  const perRowBlockH = PATTERN.length * cell + (PATTERN.length - 1) * gap; // 참가자 1명(4/4/2) 높이
  const computedW = margins.left + gridW + margins.right; // ✅ 좌우 분리 반영
  const computedH =
    margins.top + margins.bottom + rows * perRowBlockH + (rows - 1) * gap;

  const W = boardWidth ?? computedW;
  const H = boardHeight ?? computedH;

  const gridStartX = margins.left; // ✅ 좌측 마진만큼 띄우고 시작
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

  // ✅ 배경에 따라 닉네임 색
  const nicknameColor = bgKey === "bg1" ? "#fff" : "#52c4ff";
  // (가독성 보강하고 싶으면 textShadow 주석 해제)
  const nicknameShadow = bgKey === "bg1" ? "0 1px 2px rgba(0,0,0,.45)" : "none";

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        // ✅ 부모 섹션에 배경이미지가 들어오므로 투명 처리
        background: "transparent",
        border: "none",
        boxSizing: "border-box",
      }}
    >
      {/* 닉네임: 좌측 마진 영역에 '블록 전체 높이'로 중앙 정렬 */}
      {participants.map((p, r) => (
        <div
          key={`nick-${r}`}
          style={{
            position: "absolute",
            right: 20,
            top: 175, // ✅ 각 참가자 블록의 시작 Y
            display: "flex",
            alignItems: "center", // 수직 중앙
            justifyContent: "center", // 수평 중앙
            padding: "0 8px", // 좌우 여유
            boxSizing: "border-box",
          }}
          title={p.nickname}
        >
          {/* 줄바꿈 + 최대 줄수(예: 6줄) 말줄임 처리 */}
          <div
            style={{
              color: nicknameColor,
              textShadow: nicknameShadow,
              fontWeight: 600,
              fontSize: 22,
              lineHeight: 1.2,
              textAlign: "right",
              overflow: "hidden",
              display: "-webkit-box", // ✅ line-clamp 위한 설정
              WebkitBoxOrient: "vertical",
              overflowWrap: "anywhere", // ✅ 한글/영문 모두 안전
            }}
          >
            {p.nickname || "\u00A0"}
          </div>
        </div>
      ))}

      {/* 이미지 셀 */}
      {participants.map((p, r) =>
        Array.from(
          { length: Math.min(titles.length, prefix[PATTERN.length]) }, // 10개
          (_, k) => {
            const { wr, wc } = idxToWrap(k);
            const src = getSrc(p.images?.[k]);
            return (
              <div
                key={`cell-${r}-${k}`}
                style={{
                  position: "absolute",
                  left: colX(wc),
                  top: rowYBase(r) + wr * (cell + gap + 20),
                  width: cell,
                  height: cell,
                  boxSizing: "border-box",
                  border: "1px solid #000",
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
                    crossOrigin="anonymous"
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
