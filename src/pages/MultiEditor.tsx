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

import { db, storage } from "../lib/firebase";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

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

  if (!imageValue) {
    ctx.fillStyle = "#aaa";
    ctx.font = "12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No Image", x + size / 2, y + size / 2);
    return;
  }

  try {
    let imageSrc: string;

    if (imageValue instanceof File) {
      imageSrc = URL.createObjectURL(imageValue);
    } else {
      imageSrc = imageValue;
    }

    const img = await loadImage(imageSrc);

    // object-fit: cover 효과
    const imgAspect = img.width / img.height;
    const cellAspect = 1;

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > cellAspect) {
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

    // YouTube 썸네일 스케일 처리
    if (imageSrc.includes("ytimg.com")) {
      const scale = 1.4;
      const scaledW = drawWidth * scale;
      const scaledH = drawHeight * scale;
      drawX = x - (scaledW - size) / 2;
      drawY = y - (scaledH - size) / 2;
      drawWidth = scaledW;
      drawHeight = scaledH;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

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

export async function uploadImageAndGetUrl(file: File, path: string) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

export default function MultiEditor() {
  const nav = useNavigate();
  const { roomId } = useParams<{ roomId?: string }>();

  // 인원 & 데이터
  const [count, setCount] = useState(2);
  const [participants, setParticipants] = useState<Participant[]>(
    Array.from({ length: 2 }, () => ({
      nickname: "",
      images: Array(IMG_COLS).fill(null),
    }))
  );
  const titles = DEFAULT_TITLES;

  const [countField, setCountField] = useState(String(count));

  // 배경 선택
  const [bgKey, setBgKey] = useState<"bg1" | "bg2">("bg1");
  const selectedBgUrl = bgKey === "bg1" ? BG1 : BG2;

  // 방 레퍼런스
  const roomRef = useMemo(
    () => (roomId ? doc(db, "rooms", roomId) : null),
    [roomId]
  );

  // /multi 로 들어온 경우: 방 자동 생성 → 이동
  useEffect(() => {
    if (roomId) return;
    (async () => {
      const newRef = doc(collection(db, "rooms"));
      const initial: {
        titles: string[];
        participants: Participant[];
        count: number;
        createdAt: any;
        updatedAt: any;
      } = {
        titles: DEFAULT_TITLES,
        participants,
        count: participants.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(newRef, initial);
      nav(`/multi/${newRef.id}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // helpers
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  const makeEmptyParticipant = (): Participant => ({
    nickname: "",
    images: Array(IMG_COLS).fill(null),
  });

  // 서버 상태 실시간 구독
  useEffect(() => {
    if (!roomRef) return;

    let initializing = true;

    const unsub = onSnapshot(roomRef, async (snap) => {
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
        return;
      }

      const data = snap.data() as any;

      let p: Participant[] = Array.isArray(data?.participants)
        ? [...data.participants]
        : [];
      if (p.length < 2) {
        for (let i = p.length; i < 2; i++) p.push(makeEmptyParticipant());
        void updateDoc(roomRef, {
          participants: p,
          updatedAt: serverTimestamp(),
        }).catch(console.error);
      }

      const c = clamp(
        typeof data?.count === "number" ? data.count : p.length || 2,
        2,
        10
      );
      if (data?.count !== c) {
        void updateDoc(roomRef, {
          count: c,
          updatedAt: serverTimestamp(),
        }).catch(console.error);
      }

      setParticipants(p);
      setCount(c);
      if (initializing) {
        setCountField(String(c));
        initializing = false;
      }
    });

    return () => unsub();
  }, [roomRef]);

  // 인원 변경
  const onChangeCount = (n: number) => {
    const c = Math.max(2, Math.min(10, Math.floor(n) || 2));
    setCount(c);
    setCountField(String(c));
    setParticipants((prev) => {
      const next = [...prev];
      if (next.length < c) {
        while (next.length < c) next.push(makeEmptyParticipant());
      } else if (next.length > c) {
        next.length = c;
      }
      if (roomRef) {
        updateDoc(roomRef, {
          participants: next,
          count: c,
          updatedAt: serverTimestamp(),
        }).catch((e) => {
          console.error("count update failed:", e);
          alert("인원 수 저장에 실패했어요. 권한/네트워크를 확인해 주세요.");
        });
      }
      return next;
    });
  };

  // 입력 확정 처리
  const commitCountFromField = () => {
    const n = parseInt(countField, 10);
    if (Number.isNaN(n)) {
      setCountField(String(count));
      return;
    }
    onChangeCount(Math.min(10, Math.max(2, n)));
  };

  // 닉네임 변경
  const updateNickname = (idx: number, name: string) => {
    setParticipants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], nickname: name };
      if (roomRef) {
        updateDoc(roomRef, {
          participants: next,
          updatedAt: serverTimestamp(),
        }).catch((e) => {
          console.error("nickname update failed:", e);
          alert("닉네임 저장에 실패했어요.");
        });
      }
      return next;
    });
  };

  // 이미지 업데이트
  const updateImage = (
    idx: number,
    imgIdx: number,
    v: File | string | null
  ) => {
    const persist = (imagesArray: (File | string | null)[]) => {
      if (roomRef) {
        updateDoc(roomRef, {
          participants: imagesArray
            ? participants.map((p, i) =>
                i === idx ? { ...p, images: imagesArray } : p
              )
            : participants,
          updatedAt: serverTimestamp(),
        }).catch((e) => {
          console.error("image update failed:", e);
          alert("이미지 저장에 실패했어요.");
        });
      }
    };

    setParticipants((prev) => {
      const next = [...prev];
      const imgs = [...(next[idx].images || [])];

      if (v instanceof File) {
        const tempUrl = URL.createObjectURL(v);
        imgs[imgIdx] = tempUrl;
        next[idx] = { ...next[idx], images: imgs };
        if (roomId) {
          const key = `${roomId}/${idx}-${imgIdx}-${Date.now()}-${v.name}`;
          uploadImageAndGetUrl(v, key)
            .then((url) => {
              setParticipants((curr) => {
                const n2 = [...curr];
                const i2 = [...(n2[idx].images || [])];
                i2[imgIdx] = url;
                n2[idx] = { ...n2[idx], images: i2 };
                if (roomRef) {
                  updateDoc(roomRef, {
                    participants: n2,
                    updatedAt: serverTimestamp(),
                  }).catch((e) => {
                    console.error("image url save failed:", e);
                    alert("업로드 URL 저장에 실패했어요.");
                  });
                }
                return n2;
              });
            })
            .catch((e) => {
              console.error(e);
              alert("이미지 업로드 실패");
            });
        }
      } else {
        imgs[imgIdx] = (v as string | null) ?? null;
        next[idx] = { ...next[idx], images: imgs };
        persist(imgs);
      }

      return next;
    });
  };

  // 이미지 로드 에러 로그
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

  // 보드 사이즈/스케일
  const previewData = useMemo(() => participants, [participants]);
  const boardHeight = useMemo(
    () => TOP + BOTTOM + count * CELL + (count - 1) * GAP,
    [count]
  );
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useLayoutEffect(() => {
    const handleResize = () => {
      const wrap = previewWrapRef.current;
      if (!wrap) return;
      const available = wrap.clientWidth - 8;
      const fit = available / BOARD_W;
      const s = Math.min(1, fit);
      setPreviewScale(s);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [boardHeight]);

  // Canvas PNG 저장 함수
  const handleSave = useCallback(async () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = BOARD_W;
    canvas.height = boardHeight;

    try {
      // 1. 배경 이미지 그리기
      const bgImg = await loadImage(selectedBgUrl);
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

      // 2. 각 참가자별로 그리기
      const promises: Promise<void>[] = [];

      participants.forEach((participant, rowIndex) => {
        if (rowIndex >= count) return; // 현재 설정된 인원수만

        // 참가자 행 Y 좌표
        const rowY = TOP + rowIndex * (CELL + GAP);

        // 닉네임 그리기
        if (participant.nickname) {
          ctx.font = "500 23px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // 배경에 따른 닉네임 색상
          const nicknameColor = bgKey === "bg1" ? "#fff" : "#000";
          ctx.fillStyle = nicknameColor;

          // 닉네임 위치 (왼쪽 마진 영역 중앙)
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

        // 이미지 셀들 그리기
        for (let colIndex = 0; colIndex < IMG_COLS; colIndex++) {
          const imageValue = participant.images?.[colIndex];
          const cellX = LEFT_SIDE + colIndex * (CELL + GAP);
          const cellY = rowY;

          promises.push(drawImageCell(ctx, imageValue, cellX, cellY, CELL));
        }
      });

      // 모든 이미지 그리기 완료 대기
      await Promise.all(promises);

      // 3. Canvas를 Blob으로 변환하여 다운로드
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

  const boardContentRef = useRef<HTMLDivElement>(null);

  // 방 준비 전엔 간단 표시
  if (!roomId) {
    return <div style={{ padding: 16 }}>방을 만드는 중…</div>;
  }

  return (
    <div style={{ padding: 16, backgroundColor: "#fff" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
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
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(window.location.href)
              .then(() => alert("현재 방 주소를 복사했습니다."))
              .catch(() => alert("복사를 실패했습니다."));
          }}
          style={{
            padding: "10px 12px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
          }}
        >
          URL 복사
        </button>
      </div>

      <section style={{ display: "grid", gap: 16 }}>
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
              onClick={() => onChangeCount(Math.max(2, count - 1))}
              disabled={count <= 2}
              style={{
                padding: "10px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#000",
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
              onClick={() => onChangeCount(Math.min(10, count + 1))}
              disabled={count >= 10}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#000",
              }}
              aria-label="증가"
            >
              +
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 20 }}>
          {participants.map((p, i) => (
            <div
              key={i}
              style={{ paddingBottom: 12, borderBottom: "1px solid #f0f0f0" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 20,
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

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                  gap: 10,
                }}
              >
                {Array.from({ length: IMG_COLS }, (_, j) => {
                  const cfg = COLUMN_CONFIGS[j];
                  return (
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 배경 선택 */}
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
            ref={boardContentRef}
          >
            <CollageBoard
              participants={previewData}
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
