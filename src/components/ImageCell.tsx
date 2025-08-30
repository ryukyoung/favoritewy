import React, { useMemo } from "react";
import type { ImgLike } from "../types";

export default function ImageCell({
  value,
  onChange,
  size = 100,
  label,
}: {
  value: ImgLike;
  onChange: (f: File | null) => void;
  size?: number;
  label?: string;
}) {
  const preview = useMemo(() => {
    if (!value) return "";
    if (typeof value === "string") return value;
    return URL.createObjectURL(value);
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <div style={{ fontSize: 12, color: "#666" }}>{label}</div>}
      <label
        style={{
          width: size,
          height: size,
          border: "1px solid #ccc",
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          cursor: "pointer",
          background: "#f9fafb",
        }}
      >
        {preview ? (
          <img
            src={preview}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 12, color: "#999" }}>이미지 선택</span>
        )}
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {typeof value !== "string" && value && (
        <small style={{ color: "#999" }}>로컬 파일</small>
      )}
    </div>
  );
}
