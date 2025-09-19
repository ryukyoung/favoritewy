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
    Array.from({ length: 2 }, (_) => ({
      nickname: "",
      images: Array(IMG_COLS).fill(null),
    }))
  );
  const titles = DEFAULT_TITLES;

  const [countField, setCountField] = useState(String(count));

  // ✅ 배경 선택 상태
  // bgKey: "bg1" | "bg2"
  const [bgKey, setBgKey] = useState<"bg1" | "bg2">("bg1");
  const selectedBgUrl = bgKey === "bg1" ? BG1 : BG2;

  // 방 레퍼런스 (roomId 있을 때만)
  const roomRef = useMemo(
    () => (roomId ? doc(db, "rooms", roomId) : null),
    [roomId]
  );

  // ✅ /multi 로 들어온 경우: 방 자동 생성 → 이동
  useEffect(() => {
    if (roomId) return;
    (async () => {
      const newRef = doc(collection(db, "rooms")); // 자동 ID
      const initial = {
        titles: DEFAULT_TITLES,
        participants: participants, // 현재 로컬 상태로 초기화
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

  useEffect(() => {
    if (!roomRef) return;
    let mounted = true;

    (async () => {
      const snap = await getDoc(roomRef);
      if (!mounted) return;

      if (snap.exists()) {
        const data = snap.data() as any;

        // participants 보정 (최소 2명)
        let p: Participant[] = Array.isArray(data?.participants)
          ? [...data.participants]
          : [];
        if (p.length < 2) {
          for (let i = p.length; i < 2; i++) p.push(makeEmptyParticipant());
        }

        // count 보정 (2~10로 클램프, 기본은 participants 길이)
        const c = clamp(
          typeof data?.count === "number" ? data.count : p.length || 2,
          2,
          10
        );

        // 상태 반영
        setParticipants(p);
        setCount(c);

        // Firestore에도 보정값 반영(선택: 데이터 정리용)
        if (
          data?.count !== c ||
          (Array.isArray(data?.participants) &&
            data.participants.length !== p.length)
        ) {
          await updateDoc(roomRef, {
            participants: p,
            count: c,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        // 문서가 없다면 기본값으로 생성 (최소 2명 보장)
        const base: Participant[] =
          participants.length >= 2
            ? participants
            : [makeEmptyParticipant(), makeEmptyParticipant()];
        await setDoc(roomRef, {
          titles: DEFAULT_TITLES,
          participants: base,
          count: base.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setParticipants(base);
        setCount(base.length);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomRef]);

  // 인원 변경
  const onChangeCount = (n: number) => {
    const c = Math.max(2, Math.min(10, Math.floor(n) || 2));
    setCount(c);
    setParticipants((prev) => {
      const next = [...prev];
      if (next.length < c) {
        while (next.length < c) {
          next.push({
            nickname: "",
            images: Array(IMG_COLS).fill(null),
          });
        }
      } else if (next.length > c) {
        next.length = c;
      }
      // 서버에 반영(선택)
      if (roomRef) {
        void updateDoc(roomRef, {
          participants: next,
          count: c,
          updatedAt: serverTimestamp(),
        });
      }
      return next;
    });
  };
  // count가 바뀌면 입력창도 동기화
  useEffect(() => {
    setCountField(String(count));
  }, [count]);

  // 입력 확정 처리(클램프 포함).
  const commitCountFromField = () => {
    const n = parseInt(countField, 10);
    if (Number.isNaN(n)) {
      setCountField(String(count));
      return;
    }
    onChangeCount(Math.min(10, Math.max(2, n)));
  };

  const updateNickname = (idx: number, name: string) => {
    setParticipants((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], nickname: name };
      if (roomRef) {
        void updateDoc(roomRef, {
          participants: next,
          updatedAt: serverTimestamp(),
        });
      }
      return next;
    });
  };

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

  // 이미지/프리셋/유튜브 썸네일 업데이트(+Storage 업로드)
  const updateImage = (
    idx: number,
    imgIdx: number,
    v: File | string | null
  ) => {
    setParticipants((prev) => {
      const next = [...prev];
      const imgs = [...(next[idx].images || [])];

      const saveToServer = (urlOrNull: string | null) => {
        imgs[imgIdx] = urlOrNull as any;
        next[idx] = { ...next[idx], images: imgs };
        if (roomRef) {
          void updateDoc(roomRef, {
            participants: next,
            updatedAt: serverTimestamp(),
          });
        }
      };

      if (v instanceof File) {
        if (!roomId) return next; // 방 생성 전 가드
        const key = `${roomId}/${idx}-${imgIdx}-${Date.now()}-${v.name}`;
        uploadImageAndGetUrl(v, key)
          .then((url) => saveToServer(url))
          .catch((e) => {
            console.error(e);
            alert("이미지 업로드 실패");
          });
      } else {
        saveToServer(v as string | null);
      }
      return next;
    });
  };

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
          {/* 간단한 화살표 아이콘 */}
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

      {/* ✅ 배경 선택 컨트롤 (CollageBoard 미리보기 위) */}
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
          onClick={() => {
            setBgKey("bg1");
            // 원하면 Firestore에도 반영 가능:
            // if (roomRef) void updateDoc(roomRef, { bgKey: "bg1", updatedAt: serverTimestamp() });
          }}
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
          onClick={() => {
            setBgKey("bg2");
            // if (roomRef) void updateDoc(roomRef, { bgKey: "bg2", updatedAt: serverTimestamp() });
          }}
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
