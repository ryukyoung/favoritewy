// src/pages/MultiEditor.tsx
import {
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  useEffect,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import CollageBoard from "../components/CollageBoard";
import type { Participant } from "../types";
import SmartImageCell from "../components/SmartImageCell";
import { COLUMN_CONFIGS } from "../columnConfig";
import imageCompression from "browser-image-compression";
import { db, storage } from "../lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ensureSignedIn } from "../lib/firebase";

const IMG_COLS = COLUMN_CONFIGS.length;
const GRID_ROWS = 4;
const GRID_COLS = Math.ceil(IMG_COLS / GRID_ROWS);

// 배경 파일 - public 폴더로 이동 권장
const BG1 = "../assets/bg-5.png";
const BG2 = "../assets/bg-10.png";

// 기본 타이틀
const DEFAULT_TITLES = COLUMN_CONFIGS.map((c) => c.title);

// 보드 규격
const CELL = 120;
const GAP = 15;
const LEFT_SIDE = 120;
const RIGHT_SIDE = 100;
const TOP = 280;
const BOTTOM = 110;

const GRID_W = IMG_COLS * CELL + (IMG_COLS - 1) * GAP;
const BOARD_W = LEFT_SIDE + RIGHT_SIDE + GRID_W;

/* =============================
   유틸
============================= */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${src}`));
    img.src = src;
  });
}

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
  if (currentLine) lines.push(currentLine);

  const maxLines = 3;
  const displayLines = lines.slice(0, maxLines);

  const totalHeight = displayLines.length * lineHeight;
  let startY = y - totalHeight / 2 + lineHeight / 2;

  displayLines.forEach((line, index) => {
    const currentY = startY + index * lineHeight;
    ctx.fillText(line, x, currentY);
  });
}

async function compressAndUpload(file: File, path: string) {
  const storageRef = ref(storage, path);
  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    initialQuality: 0.85,
  });
  const metadata = {
    contentType: file.type || "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  };
  await uploadBytes(storageRef, compressed, metadata);
  return await getDownloadURL(storageRef);
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const makeEmptyParticipant = (): Participant => ({
  nickname: "",
  images: Array(IMG_COLS).fill(null),
});

type RowStatus = "idle" | "dirty" | "saving" | "saved";

export default function MultiEditor() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId?: string }>();

  // 상태 관리
  const [count, setCount] = useState(2);
  const [participants, setParticipants] = useState<Participant[]>(
    Array.from({ length: 2 }, makeEmptyParticipant)
  );
  const [countField, setCountField] = useState("2");
  const [bgKey, setBgKey] = useState<"bg1" | "bg2">("bg1");
  const [previewScale, setPreviewScale] = useState(1);

  // 행별 상태: idle(기본) → dirty(변경 있음) → saving → saved(잠깐 표시 후 idle)
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({});

  const titles = DEFAULT_TITLES;
  const selectedBgUrl = bgKey === "bg1" ? BG1 : BG2;

  // 방 레퍼런스
  const roomRef = useMemo(
    () => (roomId ? doc(db, "rooms", roomId) : null),
    [roomId]
  );

  // 보드 높이 계산
  const boardHeight = useMemo(
    () => TOP + BOTTOM + count * CELL + (count - 1) * GAP,
    [count]
  );

  // refs
  const previewWrapRef = useRef<HTMLDivElement>(null);

  /* =============================
     진입: /multi → 방 생성 후 이동
  ============================== */
  useEffect(() => {
    if (roomId) return;

    const createRoom = async () => {
      const newRef = doc(collection(db, "rooms"));
      const initial = {
        titles: DEFAULT_TITLES,
        participants: Array.from({ length: 2 }, makeEmptyParticipant),
        count: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(newRef, initial);
      nav(`/multi/${newRef.id}`, { replace: true });
    };

    createRoom().catch(console.error);
  }, [roomId, nav]);

  // 초기 1회 로드 (실시간 구독 제거)
  useEffect(() => {
    if (!roomRef) return;
    let cancelled = false;

    (async () => {
      await ensureSignedIn();

      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        const base: Participant[] = [
          makeEmptyParticipant(),
          makeEmptyParticipant(),
        ];
        await setDoc(roomRef, {
          titles: DEFAULT_TITLES,
          participants: base,
          count: base.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (!cancelled) {
          setParticipants(base);
          setCount(base.length);
          setCountField(String(base.length));
        }
        return;
      }

      const data = snap.data() || {};
      let p: Participant[] = Array.isArray(data.participants)
        ? [...data.participants]
        : [];
      const c = clamp(
        typeof data.count === "number" ? data.count : p.length || 2,
        2,
        10
      );

      // ✅ 로컬 participants를 'count'까지 패딩해서 편집 행이 count개 보이게
      while (p.length < c) p.push(makeEmptyParticipant());

      if (!cancelled) {
        setParticipants(p);
        setCount(c);
        setCountField(String(c));
      }
    })().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [roomRef]);

  /* =============================
     인원 변경 (로컬만 변경)
  ============================== */
  const onChangeCount = useCallback((n: number) => {
    const c = clamp(Math.floor(n) || 2, 2, 10);
    setCount(c);
    setCountField(String(c));

    setParticipants((prev) => {
      const next = [...prev];
      if (next.length < c) {
        while (next.length < c) next.push(makeEmptyParticipant());
      } else if (next.length > c) {
        next.length = c;
      }
      return next;
    });
  }, []);

  const commitCountFromField = useCallback(() => {
    const n = parseInt(countField, 10);
    if (Number.isNaN(n)) {
      setCountField(String(count));
      return;
    }
    onChangeCount(clamp(n, 2, 10));
  }, [countField, count, onChangeCount]);

  const saveCount = useCallback(async () => {
    if (!roomRef) return;
    await ensureSignedIn();
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error("방 문서가 없습니다.");

        const data = snap.data() as any;
        const serverParticipants: Participant[] = Array.isArray(
          data.participants
        )
          ? [...data.participants]
          : [];
        // ✅ 서버의 participants도 count까지 패딩
        while (serverParticipants.length < count) {
          serverParticipants.push(makeEmptyParticipant());
        }

        tx.update(roomRef, {
          count,
          participants: serverParticipants,
          updatedAt: serverTimestamp(),
        });
      });

      // 로컬 쪽도 혹시 부족하면 맞춰둠
      setParticipants((prev) => {
        const next = [...prev];
        while (next.length < count) next.push(makeEmptyParticipant());
        return next;
      });

      alert("인원 수가 저장되었습니다.");
    } catch (e) {
      console.error(e);
      alert("인원 수 저장에 실패했습니다.");
    }
  }, [roomRef, count]);

  /* =============================
     행 상태 helpers
  ============================== */
  const setStatus = useCallback((idx: number, status: RowStatus) => {
    setRowStatus((prev) => ({ ...prev, [idx]: status }));
  }, []);
  const markDirty = useCallback(
    (idx: number) => setStatus(idx, "dirty"),
    [setStatus]
  );

  /* =============================
     닉네임/이미지 변경 (로컬만 변경, 업로드는 저장 시점)
  ============================== */
  const updateNickname = useCallback(
    (idx: number, name: string) => {
      setParticipants((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], nickname: name };
        return next;
      });
      markDirty(idx);
    },
    [markDirty]
  );

  const updateImage = useCallback(
    (idx: number, imgIdx: number, v: File | string | null) => {
      setParticipants((prev) => {
        const next = [...prev];
        const imgs = [...(next[idx].images || [])];
        // 저장 전까지는 파일/URL 그대로 로컬에 보관 (미리보기는 SmartImageCell이 처리)
        imgs[imgIdx] = v;
        next[idx] = { ...next[idx], images: imgs };
        return next;
      });
      markDirty(idx);
    },
    [markDirty]
  );

  /* =============================
     행(사람) 단위 저장
     - 이 시점에만 File들을 업로드 → URL로 치환 → Firestore 갱신
  ============================== */
  const saveRow = useCallback(
    async (idx: number) => {
      if (!roomRef) return;
      await ensureSignedIn();

      setStatus(idx, "saving");

      try {
        // 1) 로컬 행 복제
        const localRow = participants[idx] || makeEmptyParticipant();

        // 2) 파일 업로드 (있다면)
        const newImages = await Promise.all(
          (localRow.images || []).map(async (val, j) => {
            if (val && val instanceof File) {
              const key = `${roomId}/${idx}-${j}-${Date.now()}-${val.name}`;
              const url = await compressAndUpload(val, key);
              return url; // Firestore에는 URL만 저장
            }
            return val; // string(URL) or null
          })
        );

        const rowToSave: Participant = {
          ...localRow,
          images: newImages,
        };

        // 3) 트랜잭션으로 해당 idx만 반영
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(roomRef);
          if (!snap.exists()) throw new Error("방 문서가 없습니다.");

          const data = snap.data() as any;
          const serverParticipants: Participant[] = Array.isArray(
            data.participants
          )
            ? [...data.participants]
            : [];

          while (serverParticipants.length <= idx) {
            serverParticipants.push(makeEmptyParticipant());
          }

          serverParticipants[idx] = rowToSave;

          tx.update(roomRef, {
            participants: serverParticipants,
            updatedAt: serverTimestamp(),
          });
        });

        // 4) 로컬도 URL로 치환된 내용 반영 + 상태 갱신
        setParticipants((prev) => {
          const next = [...prev];
          next[idx] = rowToSave;
          return next;
        });

        setStatus(idx, "saved");
        // 잠깐 "저장됨" 보여주고 idle로 복귀
        setTimeout(() => {
          setStatus(idx, "idle");
        }, 1500);

        alert(`${idx + 1}번 내용이 저장되었습니다.`);
      } catch (e) {
        console.error(e);
        setStatus(idx, "dirty"); // 실패 시 다시 수정 상태로 되돌림
        alert("저장에 실패했습니다. 네트워크/권한을 확인해 주세요.");
      }
    },
    [roomRef, participants, roomId, setStatus]
  );

  /* =============================
     이미지 로드 에러 로그
  ============================== */
  useEffect(() => {
    const onImgError = (e: Event) => {
      const t = e.target as HTMLImageElement;
      if (t?.tagName === "IMG") {
        console.warn("[IMG LOAD ERROR]", t.src);
      }
    };
    window.addEventListener("error", onImgError, true);
    return () => window.removeEventListener("error", onImgError, true);
  }, []);

  /* =============================
     미리보기 스케일 조정
  ============================== */
  useLayoutEffect(() => {
    const handleResize = () => {
      const wrap = previewWrapRef.current;
      if (!wrap) return;

      const available = wrap.clientWidth - 8;
      const fit = available / BOARD_W;
      setPreviewScale(Math.min(1, fit));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [boardHeight]);

  /* =============================
     Canvas PNG 저장 (그림으로 내려받기)
  ============================== */
  const handleSave = useCallback(async () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = BOARD_W;
    canvas.height = boardHeight;

    try {
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready.catch(() => {});
      }

      const imageUrls: string[] = [];
      participants.forEach((participant, rowIndex) => {
        if (rowIndex >= count) return;
        for (let colIndex = 0; colIndex < IMG_COLS; colIndex++) {
          const imageValue = participant.images?.[colIndex];
          if (imageValue) {
            const imageSrc =
              imageValue instanceof File
                ? URL.createObjectURL(imageValue)
                : imageValue;
            imageUrls.push(imageSrc);
          }
        }
      });

      const loadPromises = [
        loadImage(selectedBgUrl),
        ...imageUrls.map((url) => loadImage(url)),
      ];
      const loadedImages = await Promise.all(loadPromises);
      const [bgImg, ...cellImages] = loadedImages;

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 배경
      const scaleX = canvas.width / bgImg.width;
      ctx.drawImage(
        bgImg,
        0,
        0,
        bgImg.width,
        Math.min(bgImg.height, canvas.height / scaleX),
        0,
        0,
        canvas.width,
        canvas.height
      );

      // 참가자 렌더링
      let cellImageIndex = 0;
      participants.forEach((participant, rowIndex) => {
        if (rowIndex >= count) return;

        const rowY = TOP + rowIndex * (CELL + GAP);

        // 닉네임
        if (participant.nickname) {
          ctx.font = "500 23px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = bgKey === "bg1" ? "#fff" : "#000";

          const nicknameX = LEFT_SIDE / 2;
          const nicknameY = rowY + CELL / 2;
          const maxNicknameWidth = LEFT_SIDE - 20;
          const lineHeight = 27;

          drawMultilineText(
            ctx,
            participant.nickname,
            nicknameX,
            nicknameY,
            maxNicknameWidth,
            lineHeight
          );
        }

        // 이미지 셀
        for (let colIndex = 0; colIndex < IMG_COLS; colIndex++) {
          const imageValue = participant.images?.[colIndex];
          const cellX = LEFT_SIDE + colIndex * (CELL + GAP);
          const cellY = rowY;

          // 셀 배경
          ctx.fillStyle = "#fafafa";
          ctx.fillRect(cellX, cellY, CELL, CELL);

          if (imageValue && cellImageIndex < cellImages.length) {
            const img = cellImages[cellImageIndex];
            cellImageIndex++;

            // object-fit: cover
            const imgAspect = img.width / img.height;
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > 1) {
              drawHeight = CELL;
              drawWidth = CELL * imgAspect;
              drawX = cellX - (drawWidth - CELL) / 2;
              drawY = cellY;
            } else {
              drawWidth = CELL;
              drawHeight = CELL / imgAspect;
              drawX = cellX;
              drawY = cellY - (drawHeight - CELL) / 2;
            }

            // YouTube 썸네일 보정
            let imageSrc =
              imageValue instanceof File
                ? URL.createObjectURL(imageValue)
                : imageValue;
            if (
              typeof imageSrc === "string" &&
              imageSrc.includes("ytimg.com")
            ) {
              const scale = 1.4;
              drawWidth *= scale;
              drawHeight *= scale;
              drawX = cellX - (drawWidth - CELL) / 2;
              drawY = cellY - (drawHeight - CELL) / 2;
            }

            // 클리핑 후 그리기
            ctx.save();
            ctx.beginPath();
            ctx.rect(cellX, cellY, CELL, CELL);
            ctx.clip();
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
          } else if (!imageValue) {
            ctx.fillStyle = "#aaa";
            ctx.font = "12px Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("No Image", cellX + CELL / 2, cellY + CELL / 2);
          }
        }
      });

      // 다운로드
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
  }, [selectedBgUrl, bgKey, participants, count, boardHeight]);

  /* =============================
     URL 복사
  ============================== */
  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("현재 방 주소를 복사했습니다.");
    } catch {
      alert("복사를 실패했습니다.");
    }
  }, []);

  // 방 준비 전 로딩
  if (!roomId) {
    return <div style={{ padding: 16 }}>방을 만드는 중…</div>;
  }

  return (
    <div style={{ padding: 16, backgroundColor: "#fff" }}>
      {/* 헤더 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
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
            gridColumn: 2,
          }}
        >
          취향표 편집기
        </h2>

        <button
          onClick={handleCopyUrl}
          style={{
            justifySelf: "end",
            width: "max-content",
            padding: "10px 12px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#000",
            cursor: "pointer",
          }}
        >
          URL 복사
        </button>
      </div>

      <section style={{ display: "grid", gap: 16 }}>
        {/* 인원 수 조절 + 저장 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 12,
          }}
        >
          <label style={{ fontSize: 18, display: "block", color: "#000" }}>
            인원 수 (2~10)
          </label>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onChangeCount(count - 1)}
              disabled={count <= 2}
              style={{
                padding: "10px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#000",
                cursor: count <= 2 ? "not-allowed" : "pointer",
              }}
              aria-label="감소"
            >
              −
            </button>

            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={countField}
              onChange={(e) => {
                const onlyDigits = e.target.value.replace(/[^\d]/g, "");
                setCountField(onlyDigits);
              }}
              onBlur={commitCountFromField}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCountFromField();
              }}
              placeholder="2~10"
              style={{
                width: 60,
                padding: "10px 12px",
                fontSize: 16,
                borderRadius: 10,
                border: "1px solid #ddd",
                textAlign: "center",
                background: "#fff",
                color: "#000",
              }}
            />

            <button
              type="button"
              onClick={() => onChangeCount(count + 1)}
              disabled={count >= 10}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#000",
                cursor: count >= 10 ? "not-allowed" : "pointer",
              }}
              aria-label="증가"
            >
              +
            </button>

            <button
              type="button"
              onClick={saveCount}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#000",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="인원 수 저장"
            >
              저장
            </button>
          </div>
        </div>

        {/* 참가자 목록 */}
        <div style={{ display: "grid", gap: 20 }}>
          {participants.slice(0, count).map((p, i) => {
            const status = rowStatus[i] || "idle";
            const saveLabel = status === "dirty" ? "저장" : "저장";

            return (
              <div
                key={i}
                style={{
                  paddingBottom: 12,
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 20,
                    width: "100%",
                  }}
                >
                  <strong style={{ width: 48, fontSize: 18, color: "#000" }}>
                    {i + 1}번
                  </strong>
                  <input
                    value={p.nickname}
                    onChange={(e) => updateNickname(i, e.target.value)}
                    placeholder="닉네임"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      fontSize: 16,
                      borderRadius: 10,
                      border: "none",
                      backgroundColor: "#f6f6f6",
                      color: "#000",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => saveRow(i)}
                    disabled={status === "saving"}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background:
                        status === "dirty"
                          ? "#fee1ed"
                          : status === "saved"
                          ? "#fee1ed"
                          : "#fff",
                      color: "#000",
                      cursor: status === "saving" ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      width: 55,
                    }}
                    title="이 사람만 저장"
                  >
                    {saveLabel}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                    gap: 10,
                  }}
                >
                  {COLUMN_CONFIGS.map((cfg, j) => (
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
                        value={p.images[j]}
                        onChange={(v) => updateImage(i, j, v)}
                        config={cfg}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 배경 선택 (로컬 전용) */}
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
            marginLeft: 6,
            fontWeight: 600,
            color: "#000",
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
              backgroundImage: `url(${selectedBgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "top center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <CollageBoard
              participants={participants.slice(0, count)}
              titles={titles}
              cell={CELL}
              gap={GAP}
              margins={{
                top: TOP,
                bottom: BOTTOM,
                left: LEFT_SIDE,
                right: RIGHT_SIDE,
              }}
              imgCols={IMG_COLS}
              boardWidth={BOARD_W}
              boardHeight={boardHeight}
              bgKey={bgKey}
            />
          </div>
        </div>
      </section>

      {/* 저장 버튼 (Canvas PNG) */}
      <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            color: "#fff",
            width: "100%",
            padding: "14px 16px",
            fontSize: 17,
            borderRadius: 12,
            background: "#ff7ed0",
            fontWeight: 500,
            cursor: "pointer",
            border: "1px solid #ddd",
          }}
        >
          취향표 저장
        </button>
      </div>
    </div>
  );
}
