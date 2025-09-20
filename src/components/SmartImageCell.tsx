// src/components/SmartImageCell.tsx
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import type { PresetItem, ColumnConfig } from "../columnConfig";
import { getYoutubeId, getYoutubeThumb } from "../youtubeUtil";

/** 긴 라벨을 최대 N줄로 맞추고, 넘치면 폰트를 줄여서 맞춘 뒤 그래도 넘치면 줄수 클램프 */
function AutoFitLabel({
  text,
  maxLines = 2,
  baseFont = 14, // 시작 폰트(px)
  minFont = 1, // 최소 폰트(px)
  lineH = 1.3, // unitless line-height
  style = {},
}: {
  text: string;
  maxLines?: number;
  baseFont?: number;
  minFont?: number;
  lineH?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 측정 준비: 여러 줄 허용 + 단어 쪼개기
    el.style.whiteSpace = "normal";
    (el.style as any).overflowWrap = "anywhere";
    el.style.wordBreak = "break-word";
    el.style.display = "block";
    el.style.lineHeight = String(lineH);

    let size = baseFont;
    el.style.fontSize = `${size}px`;

    const fit = () => {
      // 현재 폰트 사이즈 기준 허용 높이
      const allow = maxLines * lineH * size + 0.5;
      // 필요 시 1px씩 감소
      while (el.scrollHeight > allow && size > minFont) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      // 그래도 넘치면 마지막으로 3줄 클램프
      if (el.scrollHeight > maxLines * lineH * size + 0.5) {
        el.style.display = "-webkit-box";
        (el.style as any).WebkitLineClamp = String(maxLines);
        (el.style as any).WebkitBoxOrient = "vertical";
        el.style.overflow = "hidden";
      }
    };

    // 레이아웃 적용 후 측정
    requestAnimationFrame(fit);
  }, [text, maxLines, baseFont, minFont, lineH]);

  return (
    <span
      ref={ref}
      style={{
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        lineHeight: lineH,
        fontSize: baseFont,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

// YouTube 입력 패널을 별도 컴포넌트로 분리
const YoutubePanel = ({
  onChange,
  onHide,
}: {
  onChange: (v: string) => void;
  onHide: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 디버그 로그 추가 함수
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setDebugLog((prev) => [...prev.slice(-4), logEntry]);
  };

  useEffect(() => {
    addDebugLog("패널 열림");
  }, []);

  const applyYoutubeUrl = () => {
    const id = getYoutubeId(query.trim());
    if (!id) {
      alert("유효한 YouTube URL 또는 영상 ID를 입력해 주세요.");
      return;
    }
    onChange(getYoutubeThumb(id, "hq"));
    onHide();
  };

  // 수동 포커스 버튼
  const handleManualFocus = () => {
    const input = inputRef.current;
    if (!input) {
      addDebugLog("❌ 입력창 참조 없음");
      return;
    }

    addDebugLog("🔘 수동 포커스 시도");
    try {
      input.focus();
      addDebugLog("포커스 호출 완료");
    } catch (error) {
      addDebugLog(`❌ 포커스 에러: ${error}`);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* 디버깅 로그 표시 */}
      <div
        style={{
          fontSize: 10,
          background: "#f5f5f5",
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 120,
          overflow: "auto",
          border: "1px solid #ddd",
        }}
      >
        {debugLog.length === 0
          ? "로그 대기중..."
          : debugLog.map((log, idx) => (
              <div key={idx} style={{ marginBottom: 2 }}>
                {log}
              </div>
            ))}
      </div>

      {/* 수동 포커스 버튼 */}
      <button
        onClick={handleManualFocus}
        style={{
          padding: "12px 16px",
          fontSize: 14,
          borderRadius: 6,
          border: "2px solid #007AFF",
          background: "#E3F2FD",
          color: "#007AFF",
          fontWeight: "bold",
        }}
      >
        🔘 수동으로 입력창 활성화
      </button>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => addDebugLog("✅ INPUT 포커스 획득!")}
        onBlur={() => addDebugLog("❌ INPUT 포커스 잃음")}
        onInput={() => addDebugLog("⌨️ 입력 중")}
        placeholder="YouTube URL 입력"
        style={{
          width: "100%",
          padding: "15px",
          fontSize: 16,
          border: "2px solid #007AFF",
          borderRadius: 4,
          outline: "none",
        }}
      />

      <button
        onClick={applyYoutubeUrl}
        disabled={!query.trim()}
        style={{
          padding: "10px 12px",
          fontSize: 14,
          borderRadius: 8,
          border: "1px solid #ddd",
          background: "#fff",
          whiteSpace: "nowrap",
        }}
      >
        선택
      </button>
    </div>
  );
};

type Props = {
  value: File | string | null;
  onChange: (v: File | string | null) => void;
  config: ColumnConfig;
};

export default function SmartImageCell({ value, onChange, config }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 상태 변화 감지
  useEffect(() => {
    console.log("open 상태 변화:", open);
  }, [open]);

  const valueSummary = (() => {
    if (!value) return "선택 없음";
    if (value instanceof File) return `파일(${value.name})`;
    if (typeof value === "string") {
      const presetLabel = config.presets?.find((p) => p.url === value)?.label;
      if (presetLabel) return presetLabel;
      if (value.startsWith("http")) return "이미지 선택됨";
      return value || "텍스트";
    }
    return "선택됨";
  })();

  // 오버레이 위치
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});
  const calcOverlayPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    const PANEL_W = Math.min(380, Math.max(300, r.width));
    const belowSpace = vh - r.bottom;
    const aboveSpace = r.top;
    const panelH = 340;
    const placeBelow =
      belowSpace >= Math.min(220, panelH) || belowSpace >= aboveSpace;
    const top = placeBelow
      ? r.bottom + MARGIN
      : r.top - MARGIN - Math.min(panelH, aboveSpace - MARGIN);
    const left = Math.min(Math.max(MARGIN, r.left), vw - PANEL_W - MARGIN);
    setOverlayStyle({
      position: "fixed",
      top,
      left,
      width: PANEL_W,
      maxHeight: Math.min(
        panelH,
        placeBelow ? belowSpace - MARGIN : aboveSpace - MARGIN
      ),
      overflow: "auto",
      zIndex: 9999,
      background: "#fff",
      border: "1px solid #eaeaea",
      borderRadius: 12,
      boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    calcOverlayPos();
    const onWin = () => calcOverlayPos();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, calcOverlayPos]);

  // 밖 클릭 감지
  useEffect(() => {
    if (!open) return;

    let isIgnoring = true;

    const enableTimer = setTimeout(() => {
      isIgnoring = false;
      console.log("밖 클릭 감지 활성화");
    }, 100);

    const handleOutsideClick = (e: Event) => {
      if (isIgnoring) {
        console.log("밖 클릭 무시 중");
        return;
      }

      const target = e.target as Node;
      const a = anchorRef.current;
      const panel = document.getElementById("sic-panel");

      console.log("밖 클릭 감지:", {
        target: target?.nodeName,
        isAnchor: a?.contains(target),
        isPanel: panel?.contains(target),
      });

      if (!target) return;
      if (a?.contains(target)) return;
      if (panel?.contains(target)) return;

      console.log("밖 클릭으로 패널 닫기");
      setOpen(false);
    };

    document.addEventListener("click", handleOutsideClick, { passive: true });

    return () => {
      clearTimeout(enableTimer);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [open]);

  // 업로드
  const openFilePicker = () => fileRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) {
      onChange(f);
      setOpen(false);
      e.target.value = "";
    }
  };

  const renderPresetGrid = (presets: PresetItem[]) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0,1fr))",
        gap: 8,
      }}
    >
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => {
            if (!p.url) {
              alert(
                "이 프리셋 URL은 아직 비어 있어요. 나중에 채워 넣어 주세요."
              );
              return;
            }
            onChange(p.url);
            setOpen(false);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            width: "100%",
            display: "block",
            textAlign: "center",
          }}
          title={p.url || "URL 미지정"}
        >
          <AutoFitLabel
            text={p.label}
            maxLines={2}
            baseFont={14}
            minFont={8}
            lineH={1.2}
          />
        </button>
      ))}
    </div>
  );

  const OverlayBody = () => {
    if (config.mode === "upload") {
      return (
        <div style={{ display: "grid", gap: 8 }}>
          <button
            onClick={openFilePicker}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              padding: "12px 14px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              textAlign: "center",
            }}
          >
            사진 추가
          </button>
        </div>
      );
    }

    if (config.mode === "preset") {
      return renderPresetGrid(config.presets || []);
    }

    if (config.mode === "preset+upload") {
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <button
            onClick={openFilePicker}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              padding: "12px 14px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              textAlign: "center",
            }}
          >
            사진 추가
          </button>
          {renderPresetGrid(config.presets || [])}
        </div>
      );
    }

    if (config.mode === "youtube") {
      return <YoutubePanel onChange={onChange} onHide={() => setOpen(false)} />;
    }

    return null;
  };

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        minWidth: 0,
        border: "1px solid #e9e9e9",
        borderRadius: 12,
        position: "relative",
      }}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          console.log("버튼 클릭!", { open, timestamp: Date.now() });
          e.preventDefault();
          e.stopPropagation();

          if (!open) {
            console.log("패널 열기 시도");
            setOpen(true);
          } else {
            console.log("패널 닫기 시도");
            setOpen(false);
          }
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "11px 12px",
          background: "#fff",
          border: "none",
          outline: "none",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div
          style={{
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "#333",
            textAlign: "left",
            flex: 1,
            minWidth: 0,
          }}
          title={valueSummary}
        >
          {valueSummary}
        </div>
        <span style={{ fontSize: 12, opacity: 0.6, color: "#ff7ed0" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: "none" }}
      />

      {open && (
        <div
          id="sic-panel"
          style={{
            ...overlayStyle,
            position: "fixed",
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: 13 }}>
            <OverlayBody />
          </div>
        </div>
      )}
    </div>
  );
}
