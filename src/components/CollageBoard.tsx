import React, { useEffect, useMemo } from "react";
import type { Participant } from "../types";

type Props = {
  mode: "single" | "multi";
  participants: Participant[]; // images: (File | string | null)[]
  titles: string[];
  cell: number;
  gap: number;
  margins?: { top: number; bottom: number; side: number };
  imgCols?: number;
  boardWidth?: number;
  boardHeight?: number;
};

export default function CollageBoard({
  mode,
  participants,
  titles,
  cell,
  gap,
  margins = { top: 0, bottom: 0, side: 0 },
  imgCols = 10,
  boardWidth,
  boardHeight,
}: Props) {
  const rows = participants.length;

  // ======= 파일 미리보기 URL 맵 생성 (File -> objectURL) =======
  const fileUrlMap = useMemo(() => {
    const m = new Map<File, string>();
    participants.forEach((p) =>
      (p.images || []).forEach((v) => {
        if (v instanceof File && !m.has(v)) {
          m.set(v, URL.createObjectURL(v));
        }
      })
    );
    return m;
  }, [participants]);

  // cleanup: objectURL revoke
  useEffect(() => {
    return () => {
      fileUrlMap.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [fileUrlMap]);

  // helper: 이미지 소스 얻기
  const getSrc = (v: unknown): string | null => {
    if (!v) return null;
    if (v instanceof File) return fileUrlMap.get(v) ?? null;
    if (typeof v === "string") return v; // 이미 URL/string이면 그대로
    return null;
  };

  // ======= 레이아웃 계산 =======
  const gridW = imgCols * cell + (imgCols - 1) * gap; // 2140
  const computedW = 2 * margins.side + gridW; // 2420
  const computedH =
    margins.top + margins.bottom + rows * cell + (rows - 1) * gap;

  const W = boardWidth ?? computedW;
  const H = boardHeight ?? computedH;

  const gridStartX = margins.side;
  const rowY = (r: number) => margins.top + r * (cell + gap);
  const colX = (c: number) => gridStartX + c * (cell + gap);

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
      {/* 닉네임: 왼쪽 마진 영역에 배치 */}
      {participants.map((p, r) => (
        <div
          key={`nick-${r}`}
          style={{
            position: "absolute",
            left: 0,
            top: rowY(r),
            width: margins.side,
            height: cell,
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

      {/* 상단 타이틀(12칸) */}
      {titles.slice(0, imgCols).map((t, c) => (
        <div
          key={`title-${c}`}
          style={{
            position: "absolute",
            left: colX(c),
            top: Math.max(0, margins.top - 28),
            width: cell,
            height: 24,
            textAlign: "center",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t}
        </div>
      ))}

      {/* 이미지 셀 */}
      {participants.map((p, r) =>
        Array.from({ length: imgCols }, (_, c) => {
          const src = getSrc(p.images?.[c]);
          return (
            <div
              key={`cell-${r}-${c}`}
              style={{
                position: "absolute",
                left: colX(c),
                top: rowY(r),
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
        })
      )}
    </div>
  );
}
