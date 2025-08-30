import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: 24 }}>이미지 콜라주 메이커</h1>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => nav("/solo")} style={{ padding: "10px 16px" }}>
            1인(혼자 만들기)
          </button>
          <button
            onClick={() => nav("/multi")}
            style={{ padding: "10px 16px" }}
          >
            다인(여러 명 함께)
          </button>
        </div>
      </div>
    </div>
  );
}
