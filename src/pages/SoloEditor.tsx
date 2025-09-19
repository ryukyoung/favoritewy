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
import { toPng } from "html-to-image";
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

// ✅ 배경 파일(두 장)
const BG1 = "../assets/bg-9.png";
const BG2 = "../assets/bg-8.png";

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
// SoloEditor.tsx 안에 유틸 추가
async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  // CSS background-image도 기다리고 싶으면, 별도로 preloadImage(selectedBgUrl)도 호출
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if ("decode" in img && typeof img.decode === "function") {
          await img.decode();
        } else {
          await new Promise<void>((res, rej) => {
            if (img.complete && img.naturalWidth) return res();
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => rej(new Error("img error")), {
              once: true,
            });
          });
        }
      } catch {
        /* ignore decode error */
      }
    })
  );
}

// 배경도 미리 로딩
function preloadImage(src: string, cors = false) {
  return new Promise<void>((res, rej) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    im.onload = () => res();
    im.onerror = () => rej(new Error("bg load error"));
    im.src = src;
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

  // ===== PNG 저장용 참조 + 함수 =====
  const boardContentRef = useRef<HTMLDivElement>(null);
  const handleSave = useCallback(async () => {
    const root = boardContentRef.current;
    if (!root) return;

    // 1) 폰트
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {}
    }

    // 2) 배경 선로딩 (정적 import라면 CORS 불필요)
    try {
      await preloadImage(selectedBgUrl);
    } catch {}

    // 3) 콘텐츠 내부 IMG 모두 decode 대기
    await waitForImages(root);

    try {
      const dataUrl = await toPng(root, {
        width: PREVIEW_BOARD_W,
        pixelRatio: 1,
        cacheBust: true,
        // fetch 옵션 + useCORS 힌트
        fetchRequestInit: { mode: "cors", credentials: "omit" } as any,
        // html-to-image 버전에 따라 useCORS가 있다면 true로
        // @ts-ignore
        useCORS: true,
        style: { transform: "none", transformOrigin: "top left" },
      });
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = dataUrl;
      a.download = `collage-${ts}.png`;
      a.click();
    } catch (err) {
      console.error(err);
      alert("이미지 저장에 실패했어요. (콘솔 확인)");
    }
  }, [selectedBgUrl]);

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
        const spanAll = idxs.length === 1 && cols > 1; // ✅ 마지막 줄 1칸이면 전체 폭 사용
        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 6,
              gridColumn: spanAll ? "1 / -1" : undefined,
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
          {/* 간단한 화살표 아이콘 */}
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
          justifyContent: "flex-end",
        }}
      >
        <span style={{ fontSize: 14, marginRight: 6 }}>배경</span>
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
            ref={boardContentRef} // ⬅ 저장 대상
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
              titles={titles} // 10개
              cell={CELL}
              gap={GAP}
              // ✅ 좌우 서로 다르게 적용
              margins={{
                top: TOP,
                bottom: BOTTOM,
                left: LEFT_SIDE,
                right: RIGHT_SIDE,
              }}
              // 배경에 따른 닉네임 색
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
