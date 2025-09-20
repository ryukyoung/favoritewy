import { useNavigate } from "react-router-dom";

export default function Manual() {
  const nav = useNavigate();

  return (
    <div style={{ padding: 16 }}>
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

        <h2 style={{ margin: 0, gridColumn: 2 }}>이용 방법</h2>
      </div>

      <div style={{ marginBottom: 24 }}>
        <p style={{ color: "#666", fontSize: 14, lineHeight: 1.5 }}>
          본 사이트는 모바일 화면에 최적화되어 제작되었기 때문에, 모바일
          환경에서 사용을 권장 드립니다.
        </p>
      </div>

      <div style={{ display: "grid", gap: 24 }}>
        <section>
          <h3 style={{ marginBottom: 12 }}>1인 에디터</h3>
          <p>1인 에디터에서는 혼자 취향표를 제작할 수 있습니다.</p>
          <p>1. 닉네임을 입력합니다.</p>
          <p>2. 항목별로 필요한 사진을 업로드하거나, 선택합니다.</p>
          <p>
            3. [무대] 항목은 유튜브에서 아이브 무대 영상 또는 직캠의 URL을
            복사해서 붙여 넣으면 썸네일을 불러올 수 있습니다.
          </p>
          <p>4. 취향표의 배경을 선택합니다.</p>
          <p>5. [취향표 저장] 버튼을 클릭하여 취향표를 저장합니다.</p>
        </section>

        <section>
          <h3 style={{ marginBottom: 12 }}>멀티 에디터</h3>
          <p>멀티 에디터는 여러 사람들이 함께 취향표를 제작할 수 있습니다.</p>
          <p>1. 홈 화면에서 [다인] 버튼을 클릭하면 방이 생성됩니다.</p>
          <p>
            2. [URL 복사] 버튼을 클릭하여 함께 작업할 친구들에게 생성된 URL을
            전달합니다. (꼭 함께 작업할 친구들에게만 공유하는 것을 권장
            드립니다.)
          </p>
          <p>
            3. 인원수를 선택합니다. (최대 10인. 또한 처음 인원수를 정하고 편집을
            시작하면, 중간에 인원수를 변경하지 않는 것을 권장드립니다.)
          </p>
          <p>
            4. 각자 정한 번호별로 닉네임을 입력하고, 항목별로 필요한 사진을
            업로드하거나, 선택합니다.
          </p>
          <p>
            5. [무대] 항목은 유튜브에서 아이브 무대 영상 또는 직캠의 URL을
            복사해서 붙여 넣으면 썸네일을 불러올 수 있습니다.
          </p>
          <p>6. 작업 중인 내용이 페이지 안에서 실시간으로 공유됩니다.</p>
          <p>7. 취향표의 배경을 선택합니다.</p>
          <p>
            8. [취향표 저장] 버튼을 클릭하여 취향표를 저장합니다. (팀원들의 작업
            내용이 전부 반영되지 않았을 수 있기 때문에, 저장 전에 새로고침을
            해주세요.)
          </p>
        </section>
      </div>
    </div>
  );
}
