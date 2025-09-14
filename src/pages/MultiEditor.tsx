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
import type { Participant, RouteState } from "../types";
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

// 기본 타이틀
const DEFAULT_TITLES = COLUMN_CONFIGS.map((c) => c.title);

// 보드 규격
const CELL = 160;
const GAP = 20;
const SIDE = 140;
const TOP = 340;
const BOTTOM = 160;

const GRID_W = IMG_COLS * CELL + (IMG_COLS - 1) * GAP;
const BOARD_W = 2 * SIDE + GRID_W;

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
    Array.from({ length: 2 }, (_, i) => ({
      nickname: `User${i + 1}`,
      images: Array(IMG_COLS).fill(null),
    }))
  );
  const titles = DEFAULT_TITLES;

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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(newRef, initial);
      nav(`/multi/${newRef.id}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // 방 로드(링크로 직접 들어온 경우 포함)
  useEffect(() => {
    if (!roomRef) return;
    let mounted = true;
    (async () => {
      const snap = await getDoc(roomRef);
      if (!mounted) return;
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data?.participants) setParticipants(data.participants);
      } else {
        await setDoc(roomRef, {
          titles: DEFAULT_TITLES,
          participants,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
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
            nickname: `User${next.length + 1}`,
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
          updatedAt: serverTimestamp(),
        });
      }
      return next;
    });
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
        pixelRatio: 2,
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
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>멀티 취향표 편집기</h2>

      <section style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={{ fontSize: 14, display: "block", marginBottom: 6 }}>
            인원 수 (2~10)
          </label>
          <input
            type="number"
            min={2}
            max={10}
            value={count}
            onChange={(e) => onChangeCount(Number(e.target.value))}
            style={{
              width: 140,
              padding: "12px 14px",
              fontSize: 16,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />
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
                  marginBottom: 10,
                }}
              >
                <strong style={{ width: 48, fontSize: 14 }}>{i + 1}번</strong>
                <input
                  value={p.nickname}
                  onChange={(e) => updateNickname(i, e.target.value)}
                  placeholder="닉네임"
                  style={{
                    padding: "12px 14px",
                    fontSize: 16,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    flex: 1,
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
                          fontSize: 12,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          padding: "2px 2px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
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

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
          }}
        >
          PNG로 저장
        </button>

        {/* 공유용 주소 복사(선택) */}
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(window.location.href)
              .then(() => alert("현재 방 주소를 복사했어요!"))
              .catch(() => alert("복사에 실패했어요."));
          }}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
          }}
        >
          방 주소 복사
        </button>
      </div>

      <section
        ref={previewWrapRef}
        style={{
          marginTop: 20,
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
            }}
            ref={boardContentRef}
          >
            <CollageBoard
              participants={previewData}
              titles={titles}
              cell={CELL}
              gap={GAP}
              margins={{ top: TOP, bottom: BOTTOM, side: SIDE }}
              imgCols={IMG_COLS}
              boardWidth={BOARD_W}
              boardHeight={boardHeight}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
