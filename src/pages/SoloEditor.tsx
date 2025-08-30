import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CollageBoard from "../components/CollageBoard";
import ImageCell from "../components/ImageCell";
import type { Participant, RouteState } from "../types";

const DEFAULT_TITLES = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`);

export default function SoloEditor() {
  const nav = useNavigate();
  const [nickname, setNickname] = useState("닉네임");
  const [titles, setTitles] = useState<string[]>(DEFAULT_TITLES);
  const [images, setImages] = useState<(File | null)[]>(Array(12).fill(null));

  const participant: Participant = useMemo(
    () => ({ nickname, images }),
    [nickname, images]
  );

  const onChangeImage = (idx: number, f: File | null) => {
    setImages((prev) => {
      const next = [...prev];
      next[idx] = f;
      return next;
    });
  };

  const goResult = () => {
    const state: RouteState = {
      mode: "solo",
      participants: [participant],
      titles,
    };
    nav("/result", { state });
  };

  return (
    <div style={{ padding: 24, display: "grid", gap: 24 }}>
      <h2>1인 에디터</h2>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* 입력 폼 */}
        <div style={{ width: 380 }}>
          <label style={{ display: "block", marginBottom: 6 }}>닉네임</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 16 }}
          />

          <div style={{ marginBottom: 8, fontWeight: 600 }}>항목(12개)</div>
          {/* 3 x 4 그리드 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <ImageCell
                key={i}
                value={images[i]}
                onChange={(f) => onChangeImage(i, f)}
                size={100}
                label={titles[i]}
              />
            ))}
          </div>
        </div>

        {/* 미리보기 */}
        <div>
          <CollageBoard
            mode="solo"
            participants={[participant]}
            titles={titles}
            cell={140}
            gap={12}
            nicknameColWidth={180}
          />
          <div style={{ marginTop: 12 }}>
            <button onClick={goResult} style={{ padding: "8px 12px" }}>
              결과 화면으로
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
