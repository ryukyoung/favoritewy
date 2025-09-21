// src/pages/SoloEditor.tsx
import {
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  useEffect,
} from "react";
import SmartImageCell from "../components/SmartImageCell";
import type { Participant } from "../types";
import { COLUMN_CONFIGS } from "../columnConfig";
import CollageBoardSingle from "../components/CollageBoardSingle";
import { useNavigate } from "react-router-dom";
import imageCompression from "browser-image-compression";

// Solo 전용: 총 10칸
const SOLO_COLS = 11;
const CELL = 160;
const GAP = 40;
const LEFT_SIDE = 60;
const RIGHT_SIDE = 60;
const TOP = 255;
const BOTTOM = 100;

// 미리보기는 4/4/2로 보일 것이므로, '최대 4열' 기준으로 보드 크기 계산
const PREVIEW_MAX_COLS = 4;
const PREVIEW_BOARD_W =
  LEFT_SIDE +
  RIGHT_SIDE +
  (PREVIEW_MAX_COLS * CELL + (PREVIEW_MAX_COLS - 1) * GAP);
const PREVIEW_ROWS = 3; // 4/4/2 → 3행
const PREVIEW_BOARD_H =
  TOP + BOTTOM + PREVIEW_ROWS * CELL + (PREVIEW_ROWS - 1) * GAP;

// 배경 파일 - public 폴더로 이동 권장
const BG1 = "../assets/bg-9.png";
const BG2 = "../assets/bg-8.png";

const PATTERN = [4, 4, 2];
const PREFIX = [0, 4, 8, 10];

// === 유틸리티 함수들 ===

// 이미지 로드 Promise 래퍼
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${src}`));
    img.src = src;
  });
}

// 인덱스를 행/열로 변환
function idxToWrap(k: number) {
  let r = 0;
  for (let i = 0; i < PATTERN.length; i++) {
    if (k >= PREFIX[i] && k < PREFIX[i + 1]) {
      r = i;
      break;
    }
  }
  const c = k - PREFIX[r];
  return { wr: r, wc: c };
}

// 다중 라인 텍스트 그리기
function drawMultilineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split("");
  const lines: string[] = [];
  let currentLine = "";

  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine !== "") {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const maxLines = 6;
  const displayLines = lines.slice(0, maxLines);
  const totalHeight = displayLines.length * lineHeight;
  let startY = y - totalHeight / 2 + lineHeight / 2;

  displayLines.forEach((line, index) => {
    const currentY = startY + index * lineHeight;
    ctx.fillText(line, x, currentY);
  });
}

// 개별 이미지 셀 그리기
async function drawImageCell(
  ctx: CanvasRenderingContext2D,
  imageValue: File | string | null,
  x: number,
  y: number,
  size: number
): Promise<void> {
  // 셀 배경 그리기
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);

  if (!imageValue) {
    ctx.fillStyle = "#aaa";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No Image", x + size / 2, y + size / 2);
    return;
  }

  try {
    const imageSrc =
      imageValue instanceof File ? URL.createObjectURL(imageValue) : imageValue;

    const img = await loadImage(imageSrc);

    const isYoutubeThumbSrc = (src: string) =>
      /(?:^|\/\/)(?:i\.)?ytimg\.com|img\.youtube\.com/i.test(src);
    // object-fit: cover 효과
    const imgAspect = img.width / img.height;
    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > 1) {
      drawHeight = size;
      drawWidth = size * imgAspect;
      drawX = x - (drawWidth - size) / 2;
      drawY = y;
    } else {
      drawWidth = size;
      drawHeight = size / imgAspect;
      drawX = x;
      drawY = y - (drawHeight - size) / 2;
    }

    if (typeof imageValue === "string" && isYoutubeThumbSrc(imageValue)) {
      const SCALE = 1.4;
      const cx = x + size / 2;
      const cy = y + size / 2;
      drawWidth *= SCALE;
      drawHeight *= SCALE;
      drawX = cx - drawWidth / 2;
      drawY = cy - drawHeight / 2;
    }
    // 클리핑 영역 설정
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, size - 2, size - 2);
    ctx.clip();

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

    // File 객체 URL 정리
    if (imageValue instanceof File) {
      URL.revokeObjectURL(imageSrc);
    }
  } catch (error) {
    console.error("이미지 셀 그리기 실패:", error);
    ctx.fillStyle = "#aaa";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Load Failed", x + size / 2, y + size / 2);
  }
}

// === IndexedDB 유틸리티 ===
const DB_NAME = "solo-editor-v1";
const STORE = "images";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, blob: Blob | null): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    if (blob === null) {
      os.delete(key);
    } else {
      os.put(blob, key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<Blob | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const os = tx.objectStore(STORE);
    const req = os.get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// 파일 압축 유틸
async function compressIfNeeded(file: File): Promise<Blob> {
  const opts = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    initialQuality: 0.85,
  };
  try {
    if (file.size <= 1.2 * 1024 * 1024) return file;
    return await imageCompression(file, opts);
  } catch {
    return file;
  }
}

// 로컬스토리지 키 헬퍼
const getStorageKey = (
  type: "nickname" | "bgKey" | "imgUrl",
  index?: number
) => {
  if (type === "imgUrl" && typeof index === "number") {
    return `solo:imgUrl:${index}`;
  }
  return `solo:${type}`;
};

export default function SoloEditor() {
  const nav = useNavigate();

  // 상태 초기화
  const [bgKey, setBgKey] = useState<"bg1" | "bg2">(
    (localStorage.getItem(getStorageKey("bgKey")) as "bg1" | "bg2") || "bg1"
  );

  const [nickname, setNickname] = useState(
    localStorage.getItem(getStorageKey("nickname")) || ""
  );

  const [images, setImages] = useState<(File | string | null)[]>(
    Array(SOLO_COLS).fill(null)
  );

  const [previewScale, setPreviewScale] = useState(1);

  // refs
  const blobUrlMapRef = useRef<Map<number, string>>(new Map());
  const previewWrapRef = useRef<HTMLDivElement>(null);

  // 계산된 값들
  const selectedBgUrl = bgKey === "bg1" ? BG1 : BG2;

  const SOLO_CONFIGS = useMemo(() => {
    const out = [...COLUMN_CONFIGS].slice(0, SOLO_COLS);
    while (out.length < SOLO_COLS) {
      out.push({ title: `항목 ${out.length + 1}`, mode: "upload" } as any);
    }
    return out;
  }, []);

  const titles = useMemo(
    () => SOLO_CONFIGS.map((c) => c.title),
    [SOLO_CONFIGS]
  );

  const participant: Participant = useMemo(
    () => ({ nickname, images }),
    [nickname, images]
  );

  // 초기 로드: localStorage/IndexedDB에서 복구
  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      const next: (string | null)[] = Array(SOLO_COLS).fill(null);

      // localStorage에서 URL 복구
      for (let i = 0; i < SOLO_COLS; i++) {
        const url = localStorage.getItem(getStorageKey("imgUrl", i));
        if (url) next[i] = url;
      }

      // IndexedDB에서 Blob 복구
      const tasks = [];
      for (let i = 0; i < SOLO_COLS; i++) {
        if (next[i] != null) continue;

        tasks.push(
          idbGet(`img:${i}`)
            .then((blob) => {
              if (blob && !cancelled) {
                const u = URL.createObjectURL(blob);
                blobUrlMapRef.current.set(i, u);
                next[i] = u;
              }
            })
            .catch(() => {
              // 에러 무시
            })
        );
      }

      await Promise.all(tasks);

      if (!cancelled) {
        setImages(next);
      }
    };

    loadInitialData();

    return () => {
      cancelled = true;
      // blob URL 정리
      for (const u of blobUrlMapRef.current.values()) {
        URL.revokeObjectURL(u);
      }
      blobUrlMapRef.current.clear();
    };
  }, []);

  // localStorage 자동 저장
  useEffect(() => {
    localStorage.setItem(getStorageKey("nickname"), nickname);
  }, [nickname]);

  useEffect(() => {
    localStorage.setItem(getStorageKey("bgKey"), bgKey);
  }, [bgKey]);

  // 이미지 변경 핸들러
  const onChangeImage = useCallback(
    async (idx: number, v: File | string | null) => {
      // 이전 blob URL 정리
      const prevBlobUrl = blobUrlMapRef.current.get(idx);
      if (prevBlobUrl) {
        URL.revokeObjectURL(prevBlobUrl);
        blobUrlMapRef.current.delete(idx);
      }

      if (v instanceof File) {
        try {
          const blob = await compressIfNeeded(v);
          await idbSet(`img:${idx}`, blob);
          localStorage.removeItem(getStorageKey("imgUrl", idx));

          const u = URL.createObjectURL(blob);
          blobUrlMapRef.current.set(idx, u);

          setImages((prev) => {
            const next = [...prev];
            next[idx] = u;
            return next;
          });
        } catch (error) {
          console.error("이미지 저장 실패:", error);
          alert("이미지 저장에 실패했습니다.");
        }
      } else if (typeof v === "string") {
        localStorage.setItem(getStorageKey("imgUrl", idx), v);
        await idbSet(`img:${idx}`, null).catch(console.error);

        setImages((prev) => {
          const next = [...prev];
          next[idx] = v;
          return next;
        });
      } else {
        localStorage.removeItem(getStorageKey("imgUrl", idx));
        await idbSet(`img:${idx}`, null).catch(console.error);

        setImages((prev) => {
          const next = [...prev];
          next[idx] = null;
          return next;
        });
      }
    },
    []
  );

  // 미리보기 스케일 조정
  useLayoutEffect(() => {
    const handleResize = () => {
      const wrap = previewWrapRef.current;
      if (!wrap) return;

      const available = wrap.clientWidth - 8;
      const fit = available / PREVIEW_BOARD_W;
      setPreviewScale(Math.min(1, fit));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Canvas PNG 저장 함수
  const handleSave = useCallback(async () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = PREVIEW_BOARD_W;
    canvas.height = PREVIEW_BOARD_H;

    try {
      // 배경 이미지 로드 및 그리기
      const bgImg = await loadImage(selectedBgUrl);
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

      // 폰트 설정
      ctx.font = "600 22px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      // 닉네임 색상 설정
      const nicknameColor = bgKey === "bg1" ? "#fff" : "#52c4ff";
      ctx.fillStyle = nicknameColor;

      // 텍스트 그림자 설정 (bg1일 때만)
      if (bgKey === "bg1") {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
      }

      // 닉네임 그리기
      if (nickname) {
        const nicknameX = canvas.width - 20;
        const nicknameY = 175;
        const maxWidth = 150;
        const lineHeight = 26;

        drawMultilineText(
          ctx,
          nickname,
          nicknameX,
          nicknameY,
          maxWidth,
          lineHeight
        );
      }

      // 그림자 리셋
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 이미지 셀들 그리기
      const promises = [];
      for (let k = 0; k < Math.min(11, images.length); k++) {
        const imageValue = images[k];
        const { wr, wc } = idxToWrap(k);
        const cellX = LEFT_SIDE + wc * (CELL + GAP);
        const cellY = TOP + wr * (CELL + GAP + 20);

        promises.push(drawImageCell(ctx, imageValue, cellX, cellY, CELL));
      }

      await Promise.all(promises);

      // Canvas를 Blob으로 변환하여 다운로드
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const timestamp = new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[:T]/g, "-");
          a.href = url;
          a.download = `collage-${timestamp}.png`;
          a.click();
          URL.revokeObjectURL(url);
        },
        "image/png",
        0.95
      );
    } catch (error) {
      console.error("Canvas 저장 실패:", error);
      alert("이미지 저장에 실패했습니다.");
    }
  }, [selectedBgUrl, bgKey, nickname, images]);

  // 행 렌더링 헬퍼
  const renderRow = useCallback(
    (idxs: number[], cols: number) => (
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
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1.2,
                  padding: "2px 2px",
                  whiteSpace: "pre-line",
                  overflow: "hidden",
                  color: "#000",
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
    ),
    [SOLO_CONFIGS, images, onChangeImage]
  );

  return (
    <div style={{ padding: 16 }}>
      {/* 헤더 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          onClick={() => nav("/")}
          aria-label="뒤로가기"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#000",
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
        </button>

        <h2
          style={{
            fontSize: 20,
            color: "#000",
            justifySelf: "center",
            margin: 0,
          }}
        >
          취향표 편집기
        </h2>
      </div>
      <section style={{ display: "grid", gap: 16 }}>
        {/* 닉네임 */}
        <div>
          <label
            style={{
              fontSize: 16,
              display: "block",
              marginBottom: 6,
              color: "#000",
              fontWeight: 500,
            }}
          >
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
              boxSizing: "border-box",
              backgroundColor: "#f6f6f6",
              border: "none",
            }}
          />
        </div>

        {/* 선택 그리드: 3/3/3/1 */}
        <div style={{ display: "grid", gap: 12 }}>
          {renderRow([0, 1, 2], 3)}
          {renderRow([3, 4, 5], 3)}
          {renderRow([6, 7, 8], 3)}
          {renderRow([9], 3)}
        </div>
      </section>
      {/* 배경 선택 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 12,
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "#000",
            marginLeft: 6,
          }}
        >
          배경
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "bg1" as const, src: BG1, label: "배경 1" },
            { key: "bg2" as const, src: BG2, label: "배경 2" },
          ].map(({ key, src, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setBgKey(key)}
              aria-pressed={bgKey === key}
              style={{
                padding: 6,
                borderRadius: 10,
                border: bgKey === key ? "2px solid #333" : "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
              }}
              title={label}
            >
              <div
                style={{
                  width: 56,
                  height: 36,
                  backgroundImage: `url(${src})`,
                  backgroundSize: "cover",
                  backgroundPosition: "top center",
                  borderRadius: 8,
                }}
              />
            </button>
          ))}
        </div>
      </div>
      {/* 미리보기 */}
      <section
        ref={previewWrapRef}
        style={{
          marginTop: 10,
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
              backgroundImage: `url(${selectedBgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "top center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <CollageBoardSingle
              participants={[participant]}
              titles={titles}
              cell={CELL}
              gap={GAP}
              margins={{
                top: TOP,
                bottom: BOTTOM,
                left: LEFT_SIDE,
                right: RIGHT_SIDE,
              }}
              bgKey={bgKey}
            />
          </div>
        </div>
      </section>
      {/* 저장 버튼 */}
      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <button
          onClick={handleSave}
          type="button"
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 17,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#ff7ed0",
            fontWeight: 500,
            cursor: "pointer",
            color: "#fff",
          }}
        >
          취향표 저장
        </button>
      </div>
    </div>
  );
}
