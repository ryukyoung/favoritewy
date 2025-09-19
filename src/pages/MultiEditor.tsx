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
import { toPng } from "html-to-image";

import { db, storage } from "../lib/firebase";
import {
  doc,
  getDoc,
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

  // 배경 선택(원하면 Firestore에 저장/복원도 가능)
  const [bgKey, setBgKey] = useState<"bg1" | "bg2">("bg1");
  const selectedBgUrl = bgKey === "bg1" ? BG1 : BG2;

  // 방 레퍼런스 (roomId 있을 때만)
  const roomRef = useMemo(
    () => (roomId ? doc(db, "rooms", roomId) : null),
    [roomId]
  );

  // /multi 로 들어온 경우: 방 자동 생성 → 이동
  useEffect(() => {
    if (roomId) return;
    (async () => {
      const newRef = doc(collection(db, "rooms")); // 자동 ID
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

  // ✅ 서버 상태 실시간 구독(새로고침/재입장 시 복원)
  useEffect(() => {
    if (!roomRef) return;

    let initializing = true;

    const unsub = onSnapshot(roomRef, async (snap) => {
      if (!snap.exists()) {
        // 문서가 없으면 생성
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

      // participants 최소 2명 보정
      let p: Participant[] = Array.isArray(data?.participants)
        ? [...data.participants]
        : [];
      if (p.length < 2) {
        for (let i = p.length; i < 2; i++) p.push(makeEmptyParticipant());
        // 서버에도 반영
        void updateDoc(roomRef, {
          participants: p,
          updatedAt: serverTimestamp(),
        }).catch(console.error);
      }

      // count 2~10 클램프
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

      // 로컬 상태 동기화
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
      // 서버 반영
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

  // 입력 확정 처리(클램프 포함)
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

  // 이미지/프리셋/유튜브 썸네일 업데이트(+Storage 업로드)
  const updateImage = (
    idx: number,
    imgIdx: number,
    v: File | string | null
  ) => {
    // 공통 저장 함수
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

    // 낙관적 로컬 업데이트
    setParticipants((prev) => {
      const next = [...prev];
      const imgs = [...(next[idx].images || [])];

      if (v instanceof File) {
        // 1) 즉시 미리보기(blob URL)
        const tempUrl = URL.createObjectURL(v);
        imgs[imgIdx] = tempUrl;
        next[idx] = { ...next[idx], images: imgs };
        // 2) 비동기 업로드 → 다운로드 URL 저장
        if (roomId) {
          const key = `${roomId}/${idx}-${imgIdx}-${Date.now()}-${v.name}`;
          uploadImageAndGetUrl(v, key)
            .then((url) => {
              // 로컬 교체
              setParticipants((curr) => {
                const n2 = [...curr];
                const i2 = [...(n2[idx].images || [])];
                i2[imgIdx] = url;
                n2[idx] = { ...n2[idx], images: i2 };
                // 서버 저장
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
        // 문자열(URL) 또는 null
        imgs[imgIdx] = (v as string | null) ?? null;
        next[idx] = { ...next[idx], images: imgs };
        // 서버 저장
        persist(imgs);
      }

      return next;
    });
  };

  // 이미지 로드 에러 로그(선택)
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

  // PNG 저장
  const boardContentRef = useRef<HTMLDivElement>(null);
  const handleSave = useCallback(async () => {
    if (!boardContentRef.current) return;
    if ((document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {}
    }
    try {
      const dataUrl = await toPng(boardContentRef.current, {
        width: BOARD_W,
        pixelRatio: 1,
        cacheBust: true,
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
  }, []);

  // 방 준비 전엔 간단 표시 (자동 생성 직후 등)
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
          }}
        >
          취향표 저장
        </button>
      </div>
    </div>
  );
}
