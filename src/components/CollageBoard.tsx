import { useEffect, useMemo } from "react";
import type { Participant } from "../types";

type Props = {
  participants: Participant[];
  titles: string[];
  cell: number;
  gap: number;
  margins?: { top: number; bottom: number; left: number; right: number };
  imgCols?: number;
  boardWidth?: number;
  boardHeight?: number;
  /** ✅ 배경 선택값: "bg1" | "bg2" | "bg3" */
  bgKey?: "bg1" | "bg2" | "bg3";
};

export default function CollageBoard({
  participants,
  cell,
  gap,
  margins = { top: 0, bottom: 0, left: 0, right: 0 },
  imgCols = 11,
  boardWidth,
  boardHeight,
  bgKey = "bg1", // ✅ 기본값
}: Props) {
  const rows = participants.length;

  // ======= 파일 미리보기 URL 맵 생성 =======
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

  // ======= 레이아웃 계산 =======
  const gridW = imgCols * cell + (imgCols - 1) * gap;
  const computedW = margins.left + gridW + margins.right;
  const computedH =
    margins.top + margins.bottom + rows * cell + (rows - 1) * gap;

  const W = boardWidth ?? computedW;
  const H = boardHeight ?? computedH;

  const gridStartX = margins.left;
  const rowY = (r: number) => margins.top + r * (cell + gap);
  const colX = (c: number) => gridStartX + c * (cell + gap);

  const isYoutubeThumbSrc = (src: string) =>
    /(?:^|\/\/)(?:i\.)?ytimg\.com|img\.youtube\.com/i.test(src);

  // ✅ 배경에 따라 닉네임 색상 자동 결정
  const nicknameColor = bgKey === "bg2" ? "#000" : "#fff";

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        boxSizing: "border-box",
      }}
    >
      {/* 닉네임: '왼쪽 마진' 영역에 배치 */}
      {participants.map((p, r) => (
        <div
          key={`nick-${r}`}
          style={{
            position: "absolute",
            left: 0,
            top: rowY(r),
            width: margins.left,
            height: cell,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 23,
            color: nicknameColor, // ✅ 배경에 맞춰 색상
            // 필요하면 가독성 보강:
            // textShadow: bgKey === "bg1" ? "0 1px 2px rgba(0,0,0,.5)" : "none",
          }}
          title={p.nickname}
        >
          {p.nickname}
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
                    transform: isYoutubeThumbSrc(src)
                      ? "scale(1.4)"
                      : undefined,
                    transformOrigin: "50% 50%",
                  }}
                />
              ) : (
                <span style={{ fontSize: 12, color: "#aaa" }}></span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
