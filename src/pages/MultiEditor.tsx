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
  updateDoc,
  serverTimestamp,
  collection,
  getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ensureSignedIn } from "../lib/firebase";

/* =============================
   디바운스 훅
============================= */
function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  deps: any[] = []
) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () =>
      (...args: Parameters<T>) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(
          () => fnRef.current(...args),
          delay
        );
      },
    [delay, ...deps]
  );
}

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

// === Canvas 관련 유틸리티 함수들 ===
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

  if (currentLine) {
    lines.push(currentLine);
  }

  const maxLines = 3;
  const displayLines = lines.slice(0, maxLines);

  const totalHeight = displayLines.length * lineHeight;
  let startY = y - totalHeight / 2 + lineHeight / 2;

  displayLines.forEach((line, index) => {
    const currentY = startY + index * lineHeight;
    ctx.fillText(line, x, currentY);
  });
}

export async function uploadImageAndGetUrl(file: File, path: string) {
  const storageRef = ref(storage, path);

  // 클라이언트 압축 (대략 1MB / 긴 변 1200px)
  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    initialQuality: 0.85,
  });

  // CDN 캐시/컨텐츠타입 메타데이터
  const metadata = {
    contentType: file.type || "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  };

  await uploadBytes(storageRef, compressed, metadata);
  return await getDownloadURL(storageRef);
}

// 헬퍼 함수들
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const makeEmptyParticipant = (): Participant => ({
  nickname: "",
  images: Array(IMG_COLS).fill(null),
});

const normalizeImages = (arr: Array<File | string | null> | undefined) => {
  const base = Array.isArray(arr) ? [...arr] : [];
  const out = Array(IMG_COLS).fill(null) as (File | string | null)[];
  for (let i = 0; i < IMG_COLS; i++) out[i] = base[i] ?? null;
  return out;
};

const normalizeParticipants = (
  p: Participant[] | undefined,
  count: number
): Participant[] => {
  const base = Array.isArray(p) ? [...p] : [];
  // 길이 보정
  const wanted = clamp(count, 2, 10);
  if (base.length < wanted) {
    for (let i = base.length; i < wanted; i++)
      base.push(makeEmptyParticipant());
  } else if (base.length > wanted) {
    base.length = wanted;
  }
  // 각 이미지 길이 보정
  return base.map((pp) => ({
    nickname: pp?.nickname ?? "",
    images: normalizeImages(pp?.images),
  }));
};

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

  // 멤버별 dirty 상태 추가
  const [memberDirty, setMemberDirty] = useState<boolean[]>(
    Array(2).fill(false)
  );

  // 자동 저장 사용 여부(디바운스). 기본 false.
  const ENABLE_AUTO_SAVE = false;

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

  // 멤버별 dirty 상태 업데이트 함수
  const setMemberDirtyState = useCallback(
    (memberIndex: number, isDirty: boolean) => {
      setMemberDirty((prev) => {
        const next = [...prev];
        next[memberIndex] = isDirty;
        return next;
      });
    },
    []
  );

  // /multi 로 들어온 경우: 방 자동 생성 → 이동
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

  // 서버에서 단발 로드
  const fetchRoom = useCallback(async () => {
    if (!roomRef) return;
    await ensureSignedIn();

    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      // 없으면 최소 문서 생성
      const base = [makeEmptyParticipant(), makeEmptyParticipant()];
      await setDoc(roomRef, {
        titles: DEFAULT_TITLES,
        participants: base,
        count: base.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setParticipants(base);
      setCount(base.length);
      setCountField(String(base.length));
      setMemberDirty(Array(base.length).fill(false));
      return;
    }

    const data = snap.data() as any;
    const serverCount = clamp(
      typeof data?.count === "number"
        ? data.count
        : data?.participants?.length ?? 2,
      2,
      10
    );

    const normalized = normalizeParticipants(data?.participants, serverCount);

    setParticipants(normalized);
    setCount(serverCount);
    setCountField(String(serverCount));
    setMemberDirty(Array(serverCount).fill(false));
  }, [roomRef]);

  // 마운트/roomId 바뀔 때 한 번만 로드 (실시간 구독 없음)
  useEffect(() => {
    fetchRoom().catch(console.error);
  }, [fetchRoom]);

  // 인원 변경 (로컬 상태만)
  const onChangeCount = useCallback((n: number) => {
    const c = clamp(Math.floor(n) || 2, 2, 10);
    setCount(c);
    setCountField(String(c));
    setParticipants((prev) => normalizeParticipants(prev, c));
    setMemberDirty((prev) => {
      const next = Array(c).fill(false);
      // 기존 dirty 상태 유지 (범위 내에서)
      for (let i = 0; i < Math.min(prev.length, c); i++) {
        next[i] = prev[i] || false;
      }
      return next;
    });
  }, []);

  // 입력 확정 처리 (Enter/blur)
  const commitCountFromField = useCallback(() => {
    const n = parseInt(countField, 10);
    if (Number.isNaN(n)) {
      setCountField(String(count));
      return;
    }
    onChangeCount(clamp(n, 2, 10));
  }, [countField, count, onChangeCount]);

  // 닉네임 변경 (로컬 상태만)
  const updateNickname = useCallback(
    (idx: number, name: string) => {
      setParticipants((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], nickname: name };
        return next;
      });
      setMemberDirtyState(idx, true);
    },
    [setMemberDirtyState]
  );

  // 이미지 변경 (로컬 상태만; File은 저장 시 업로드)
  const updateImage = useCallback(
    (idx: number, imgIdx: number, v: File | string | null) => {
      setParticipants((prev) => {
        const next = [...prev];
        const imgs = normalizeImages(next[idx]?.images);
        imgs[imgIdx] = v;
        next[idx] = { ...next[idx], images: imgs };
        return next;
      });
      setMemberDirtyState(idx, true);
    },
    [setMemberDirtyState]
  );

  // 개별 멤버 저장 함수
  const handleSaveMemberToServer = useCallback(
    async (memberIndex: number) => {
      if (!roomRef || !roomId || memberIndex >= participants.length) return;
      await ensureSignedIn();

      try {
        const participant = participants[memberIndex];

        // 해당 멤버의 File 이미지들을 Storage에 업로드
        const newImages = await Promise.all(
          (participant.images || []).map(async (v, j) => {
            if (v instanceof File) {
              const key = `${roomId}/${memberIndex}-${j}-${Date.now()}-${
                v.name
              }`;
              const url = await uploadImageAndGetUrl(v, key);
              return url;
            }
            return v;
          })
        );

        const updatedParticipant = {
          ...participant,
          images: newImages,
        };

        // Firestore에서 해당 멤버만 업데이트
        await updateDoc(roomRef, {
          [`participants.${memberIndex}`]: updatedParticipant,
          updatedAt: serverTimestamp(),
        });

        // 로컬 상태에서 해당 멤버의 이미지를 URL로 업데이트
        setParticipants((prev) => {
          const next = [...prev];
          next[memberIndex] = {
            ...next[memberIndex],
            images: newImages,
          };
          return next;
        });

        // 해당 멤버의 dirty 상태 해제
        setMemberDirtyState(memberIndex, false);

        alert(`${memberIndex + 1}번 멤버 저장 완료!`);
      } catch (e) {
        console.error(e);
        alert(
          `${memberIndex + 1}번 멤버 저장 실패. 네트워크/권한을 확인해 주세요.`
        );
      }
    },
    [roomRef, roomId, participants, setMemberDirtyState]
  );

  // 전체 저장 함수 (변경된 멤버들만)
  const handleSaveAllToServer = useCallback(async () => {
    if (!roomRef || !roomId) return;
    await ensureSignedIn();

    try {
      // dirty한 멤버들만 처리
      const dirtyIndexes = memberDirty
        .map((dirty, index) => (dirty ? index : -1))
        .filter((index) => index >= 0);

      if (dirtyIndexes.length === 0) {
        alert("저장할 변경사항이 없습니다.");
        return;
      }

      // 각 dirty 멤버별로 순차 저장
      for (const memberIndex of dirtyIndexes) {
        await handleSaveMemberToServer(memberIndex);
      }

      alert(`${dirtyIndexes.length}명의 멤버 저장 완료!`);
    } catch (e) {
      console.error(e);
      alert("일부 멤버 저장 실패.");
    }
  }, [roomRef, roomId, memberDirty, handleSaveMemberToServer]);

  // 이미지 로드 에러 로그(진단용)
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
     디바운스: 리사이즈 스케일 재계산
  ============================= */
  const recomputeScale = useCallback(() => {
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    const available = wrap.clientWidth - 8;
    const fit = available / BOARD_W;
    setPreviewScale(Math.min(1, fit));
  }, []);
  const debouncedResize = useDebouncedCallback(recomputeScale, 150, [
    recomputeScale,
  ]);

  useLayoutEffect(() => {
    recomputeScale(); // 초기 1회
    window.addEventListener("resize", debouncedResize);
    return () => window.removeEventListener("resize", debouncedResize);
  }, [debouncedResize, recomputeScale, boardHeight]);

  /* =============================
     디바운스: 인원 수 입력 자동 확정
     (타이핑 멈추면 400ms 뒤 onChangeCount)
  ============================= */
  const debouncedCommitCount = useDebouncedCallback(
    (fieldValue: string) => {
      const n = parseInt(fieldValue, 10);
      if (!Number.isNaN(n)) onChangeCount(n);
    },
    400,
    [onChangeCount]
  );

  useEffect(() => {
    if (countField === "") return;
    debouncedCommitCount(countField);
  }, [countField, debouncedCommitCount]);

  // 멤버별 자동저장 (옵션)
  const debouncedAutoSaveMember = useDebouncedCallback(
    (memberIndex: number) => {
      if (memberDirty[memberIndex]) {
        handleSaveMemberToServer(memberIndex);
      }
    },
    600,
    [memberDirty, handleSaveMemberToServer]
  );

  // 각 멤버별 자동저장 트리거
  useEffect(() => {
    if (!ENABLE_AUTO_SAVE) return;

    memberDirty.forEach((dirty, index) => {
      if (dirty) {
        debouncedAutoSaveMember(index);
      }
    });
  }, [memberDirty, debouncedAutoSaveMember, ENABLE_AUTO_SAVE]);

  // Canvas PNG 저장 함수 (기존 그대로)
  const handleSave = useCallback(async () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = BOARD_W;
    canvas.height = boardHeight;

    try {
      // 폰트 로딩 대기
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready.catch(() => {});
      }

      // 모든 이미지 URL 수집
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

      // 모든 이미지 로딩
      const loadPromises = [
        loadImage(selectedBgUrl),
        ...imageUrls.map((url) => loadImage(url)),
      ];

      const loadedImages = await Promise.all(loadPromises);
      const [bgImg, ...cellImages] = loadedImages;

      // 안전 대기
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 배경 그리기
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

      // 참가자별 렌더링
      let cellImageIndex = 0;
      participants.forEach((participant, rowIndex) => {
        if (rowIndex >= count) return;

        const rowY = TOP + rowIndex * (CELL + GAP);

        // 닉네임 그리기
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

        // 이미지 셀들 그래픽
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

            // object-fit: cover 효과
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

            // YouTube 썸네일 특별 처리
            let imageSrc =
              imageValue instanceof File
                ? URL.createObjectURL(imageValue)
                : imageValue;

            if (imageSrc.includes("ytimg.com")) {
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

            // File URL 정리
            if (imageValue instanceof File) {
              URL.revokeObjectURL(imageSrc);
            }
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

  // URL 복사 함수
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
        {/* 인원 수 조절 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
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
          </div>
        </div>

        {/* 참가자 목록 */}
        <div style={{ display: "grid", gap: 20 }}>
          {participants.slice(0, count).map((p, i) => (
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
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
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
                      padding: "12px 14px",
                      fontSize: 16,
                      borderRadius: 10,
                      flex: 1,
                      border: "none",
                      backgroundColor: "#f6f6f6",
                    }}
                  />
                </div>

                {/* 개별 저장 버튼 */}
                <button
                  onClick={() => handleSaveMemberToServer(i)}
                  disabled={!memberDirty[i]}
                  style={{
                    padding: "8px 12px",
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: memberDirty[i] ? "#4f46e5" : "#9ca3af",
                    color: "#fff",
                    cursor: memberDirty[i] ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}
                >
                  {memberDirty[i] ? "저장" : "저장됨"}
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
          ))}
        </div>
      </section>

      {/* 변경된 멤버들 일괄 저장 버튼 */}
      <div style={{ display: "flex", justifyContent: "end", marginTop: 16 }}>
        <button
          onClick={handleSaveAllToServer}
          disabled={!memberDirty.some((dirty) => dirty)}
          style={{
            padding: "12px 12px",
            fontSize: 16,
            lineHeight: 1,
            borderRadius: 8,
            background: memberDirty.some((dirty) => dirty)
              ? "#4f46e5"
              : "#9ca3af",
            color: "#fff",
            fontWeight: 500,
            cursor: memberDirty.some((dirty) => dirty)
              ? "pointer"
              : "not-allowed",
            border: "1px solid #ddd",
          }}
        >
          변경된 멤버들 저장 ({memberDirty.filter(Boolean).length}명)
        </button>
      </div>

      {/* 배경 선택 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 16,
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
              onClick={() => {
                setBgKey(key);
              }}
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

      {/* PNG 저장 버튼 */}
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
