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

// ✅ 브라우저 이미지 압축
import imageCompression from "browser-image-compression";

// === Solo 전용: 총 10칸 ===
const SOLO_COLS = 10; // 10개 고정
const CELL = 160;
const GAP = 40;
const LEFT_SIDE = 60;
const RIGHT_SIDE = 60;
const TOP = 255;
const BOTTOM = 100;

// ★ 미리보기는 4/4/2로 보일 것이므로, '최대 4열' 기준으로 보드 크기 계산
const PREVIEW_MAX_COLS = 4;
const PREVIEW_BOARD_W =
  LEFT_SIDE +
  RIGHT_SIDE +
  (PREVIEW_MAX_COLS * CELL + (PREVIEW_MAX_COLS - 1) * GAP);
const PREVIEW_ROWS = 3; // 4/4/2 → 3행
const PREVIEW_BOARD_H =
  TOP + BOTTOM + PREVIEW_ROWS * CELL + (PREVIEW_ROWS - 1) * GAP;

// ✅ 배경 파일(두 장) - public 폴더로 이동 권장
const BG1 = "../assets/bg-9.png";
const BG2 = "../assets/bg-8.png";

// === 유틸리티 함수들을 컴포넌트 외부로 이동 ===

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
function idxToWrap(k: number, pattern: number[], prefix: number[]) {
  let r = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (k >= prefix[i] && k < prefix[i + 1]) {
      r = i;
      break;
    }
  }
  const c = k - prefix[r];
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
  const words = text.split(""); // 한글은 글자 단위로 분할
  const lines: string[] = [];
  let currentLine = "";

  // 단어별로 줄 나누기
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

  // 최대 6줄까지만 표시
  const maxLines = 6;
  const displayLines = lines.slice(0, maxLines);

  // 여러 줄 중앙 정렬을 위한 시작 Y 계산
  const totalHeight = displayLines.length * lineHeight;
  let startY = y - totalHeight / 2 + lineHeight / 2;

  // 각 줄 그리기
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
  // 1. 셀 배경 그리기 (회색 배경 + 검은 테두리)
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);

  if (!imageValue) {
    // 이미지가 없을 때 "No Image" 텍스트
    ctx.fillStyle = "#aaa";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No Image", x + size / 2, y + size / 2);
    return;
  }

  try {
    let imageSrc: string;

    // File 객체 처리
    if (imageValue instanceof File) {
      // File을 blob URL로 변환
      imageSrc = URL.createObjectURL(imageValue);
    } else {
      imageSrc = imageValue;
    }

    // 이미지 로드 및 그리기
    const img = await loadImage(imageSrc);

    // 이미지를 셀 크기에 맞춰 그리기 (object-fit: cover 효과)
    const imgAspect = img.width / img.height;
    const cellAspect = 1; // 정사각형

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > cellAspect) {
      // 이미지가 더 넓음 - 높이를 맞추고 좌우 크롭
      drawHeight = size;
      drawWidth = size * imgAspect;
      drawX = x - (drawWidth - size) / 2;
      drawY = y;
    } else {
      // 이미지가 더 높음 - 폭을 맞추고 상하 크롭
      drawWidth = size;
      drawHeight = size / imgAspect;
      drawX = x;
      drawY = y - (drawHeight - size) / 2;
    }

    // 클리핑 영역 설정하여 셀 경계 밖으로 나가지 않도록
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, size - 2, size - 2); // 테두리 1px 고려
    ctx.clip();

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

    // File 객체였다면 생성한 URL 정리
    if (imageValue instanceof File) {
      URL.revokeObjectURL(imageSrc);
    }
  } catch (error) {
    console.error("이미지 셀 그리기 실패:", error);
    // 실패 시 "No Image" 표시
    ctx.fillStyle = "#aaa";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Load Failed", x + size / 2, y + size / 2);
  }
}

// ===== IndexedDB 아주 얇은 유틸 =====
const DB_NAME = "solo-editor-v1";
const STORE = "images";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
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
    if (blob === null) os.delete(key);
    else os.put(blob, key);
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

// ✅ 파일 압축 유틸 (대략 1MB 이하, 긴 변 1200px)
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

export default function SoloEditor() {
  const nav = useNavigate();

  // 배경 선택 상태 (localStorage 초기값 반영)
  const [bgKey, setBgKey] = useState<"bg1" | "bg2">(
    (localStorage.getItem("solo:bgKey") as "bg1" | "bg2") || "bg1"
  );
  const selectedBgUrl = bgKey === "bg1" ? BG1 : BG2;

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

  // 3) 단일 참가자 상태 (닉네임은 localStorage 초기값)
  const [nickname, setNickname] = useState(
    localStorage.getItem("solo:nickname") || ""
  );

  // 이미지: 문자열(URL/dataURL/blobURL) | null
  const [images, setImages] = useState<(File | string | null)[]>(
    Array(SOLO_COLS).fill(null)
  );

  // blob: URL 누수 방지를 위한 맵
  const blobUrlMapRef = useRef<Map<number, string>>(new Map());

  const participant: Participant = useMemo(
    () => ({ nickname, images }),
    [nickname, images]
  );

  // ======== 초기 로드: localStorage/IndexedDB 에서 복구 ========
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: (string | null)[] = Array(SOLO_COLS).fill(null);

      // 1) localStorage에 URL이 있으면 우선 사용
      for (let i = 0; i < SOLO_COLS; i++) {
        const url = localStorage.getItem(`solo:imgUrl:${i}`);
        if (url) next[i] = url;
      }

      // 2) 나머지는 IndexedDB에서 Blob 불러와 blob:URL 생성
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < SOLO_COLS; i++) {
        if (next[i] != null) continue; // 이미 채움
        tasks.push(
          (async (idx: number) => {
            try {
              const blob = await idbGet(`img:${idx}`);
              if (blob) {
                const u = URL.createObjectURL(blob);
                blobUrlMapRef.current.set(idx, u);
                next[idx] = u;
              }
            } catch {
              /* ignore */
            }
          })(i)
        );
      }
      await Promise.all(tasks);
      if (!cancelled) {
        setImages(next);
      }
    })();

    return () => {
      cancelled = true;
      // 마운트 중 생성했던 blob:URL 정리
      for (const u of blobUrlMapRef.current.values()) {
        URL.revokeObjectURL(u);
      }
      blobUrlMapRef.current.clear();
    };
  }, []);

  // 닉네임/bgKey 변경 시 즉시 저장
  useEffect(() => {
    localStorage.setItem("solo:nickname", nickname);
  }, [nickname]);
  useEffect(() => {
    localStorage.setItem("solo:bgKey", bgKey);
  }, [bgKey]);

  // 이미지 변경 핸들러 + (압축 후) 영구 저장
  const onChangeImage = (idx: number, v: File | string | null) => {
    setImages((prev) => {
      const next = [...prev];

      // 이전 blob:URL 있으면 정리
      const prevVal = next[idx];
      const prevBlobUrl = blobUrlMapRef.current.get(idx);
      if (
        typeof prevVal === "string" &&
        prevBlobUrl &&
        prevVal === prevBlobUrl
      ) {
        URL.revokeObjectURL(prevBlobUrl);
        blobUrlMapRef.current.delete(idx);
      }

      if (v instanceof File) {
        (async () => {
          // 🔽 압축
          const blob = await compressIfNeeded(v);
          // 1) IndexedDB에 Blob 저장
          await idbSet(`img:${idx}`, blob);
          // 2) localStorage의 URL 키 제거
          localStorage.removeItem(`solo:imgUrl:${idx}`);
          // 3) 미리보기 위해 blob:URL 생성
          const u = URL.createObjectURL(blob);
          blobUrlMapRef.current.set(idx, u);
          setImages((p) => {
            const nn = [...p];
            nn[idx] = u;
            return nn;
          });
        })();
      } else if (typeof v === "string") {
        // 외부 URL or dataURL → localStorage에 저장
        localStorage.setItem(`solo:imgUrl:${idx}`, v);
        // IndexedDB의 Blob은 제거
        void idbSet(`img:${idx}`, null);
        next[idx] = v;
      } else {
        // null → 모두 제거
        localStorage.removeItem(`solo:imgUrl:${idx}`);
        void idbSet(`img:${idx}`, null);
        next[idx] = null;
      }
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
      const s = Math.min(1, fit);
      setPreviewScale(s);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ===== Canvas로 PNG 저장하는 함수 =====
  const handleSave = useCallback(async () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas 크기 설정
    canvas.width = PREVIEW_BOARD_W;
    canvas.height = PREVIEW_BOARD_H;

    try {
      // 1. 배경 이미지 로드 및 그리기
      const bgImg = await loadImage(selectedBgUrl);
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

      // 2. 폰트 설정
      ctx.font = "600 22px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      // 3. 닉네임 색상 설정 (배경에 따라)
      const nicknameColor = bgKey === "bg1" ? "#fff" : "#52c4ff";
      ctx.fillStyle = nicknameColor;

      // 텍스트 그림자 설정 (bg1일 때만)
      if (bgKey === "bg1") {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
      }

      // 4. 닉네임 그리기
      const nicknameX = canvas.width - 20; // 우측에서 20px 떨어진 곳
      const nicknameY = 175; // 상단에서 175px

      // 긴 닉네임 처리 (줄바꿈)
      const maxWidth = 150; // 닉네임 영역 최대 폭
      const lineHeight = 26; // 줄 높이 (22px * 1.2)

      if (nickname) {
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

      // 5. 이미지 셀들 그리기
      const PATTERN = [4, 4, 2];
      const prefix = [0, 4, 8, 10];

      // 각 셀의 위치 계산 및 이미지 그리기
      const promises: Promise<void>[] = [];

      for (let k = 0; k < Math.min(10, images.length); k++) {
        const imageValue = images[k];

        // 셀 위치 계산
        const { wr, wc } = idxToWrap(k, PATTERN, prefix);
        const cellX = LEFT_SIDE + wc * (CELL + GAP);
        const cellY = TOP + wr * (CELL + GAP + 20);

        // 이미지 로드 및 그리기 작업을 Promise로 처리
        promises.push(drawImageCell(ctx, imageValue, cellX, cellY, CELL));
      }

      // 모든 이미지 그리기 완료까지 대기
      await Promise.all(promises);

      // 6. Canvas를 Blob으로 변환하여 다운로드
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

  // === 선택창 분배: 3,3,3,1 (총 10칸) ===
  const row1 = [0, 1, 2];
  const row2 = [3, 4, 5];
  const row3 = [6, 7, 8];
  const row4 = [9];

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
  );

  const boardContentRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ padding: 16 }}>
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
          title="뒤로가기"
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
          }}
        >
          취향표 편집기
        </h2>
      </div>

      {/* 위: 입력 / 아래: 미리보기 */}
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

        {/* 선택 그리드: 3 / 3 / 3 / 1(가득폭) */}
        <div style={{ display: "grid", gap: 12 }}>
          {renderRow(row1, 3)}
          {renderRow(row2, 3)}
          {renderRow(row3, 3)}
          {renderRow(row4, 3)}
        </div>
      </section>

      {/* ✅ 배경 선택 컨트롤 (미리보기 위) */}
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
          <button
            type="button"
            onClick={() => setBgKey("bg1")}
            aria-pressed={bgKey === "bg1"}
            style={{
              padding: 6,
              borderRadius: 10,
              border: bgKey === "bg1" ? "2px solid #333" : "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
            title="배경 1"
          >
            <div
              style={{
                width: 56,
                height: 36,
                backgroundImage: `url(${BG1})`,
                backgroundSize: "cover",
                backgroundPosition: "top center",
                borderRadius: 8,
              }}
            />
          </button>
          <button
            type="button"
            onClick={() => setBgKey("bg2")}
            aria-pressed={bgKey === "bg2"}
            style={{
              padding: 6,
              borderRadius: 10,
              border: bgKey === "bg2" ? "2px solid #333" : "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
            title="배경 2"
          >
            <div
              style={{
                width: 56,
                height: 36,
                backgroundImage: `url(${BG2})`,
                backgroundSize: "cover",
                backgroundPosition: "top center",
                borderRadius: 8,
              }}
            />
          </button>
        </div>
      </div>
      {/* 미리보기: 4/4/2 보드 */}
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
            ref={boardContentRef}
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
