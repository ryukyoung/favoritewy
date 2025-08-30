import React, { useState, useRef } from "react";

type Item = {
  title: string;
  image?: string;
};

const App: React.FC = () => {
  const [items, setItems] = useState<Item[]>(
    Array(9)
      .fill(null)
      .map(() => ({ title: "", image: undefined }))
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleTitleChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index].title = value;
    setItems(newItems);
  };

  const handleImageChange = (index: number, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const newItems = [...items];
      newItems[index].image = reader.result as string;
      setItems(newItems);
    };
    reader.readAsDataURL(file);
  };

  const drawCollage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const size = 150;
    const spacing = 10;

    items.forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = col * (size + spacing);
      const y = row * (size + spacing);

      if (item.image) {
        const img = new Image();
        img.src = item.image;
        img.onload = () => {
          ctx.drawImage(img, x, y, size, size);
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, size, size);

          ctx.fillStyle = "#000";
          ctx.font = "14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(item.title || "", x + size / 2, y + size + 15);
        };
      } else {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, size, size);
        ctx.fillStyle = "#000";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(item.title || "", x + size / 2, y + size + 15);
      }
    });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "my-collage.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <>
      <style>{`
        /* 모바일부터 데스크톱까지 그리드 칼럼 변경 */
        .grid-container {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 10px;
        }
        @media (min-width: 480px) {
          .grid-container {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 768px) {
          .grid-container {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .input-box {
          border: 1px solid #ccc;
          padding: 8px;
          box-sizing: border-box;
        }
        input[type="text"] {
          width: 100%;
          padding: 8px;
          margin-bottom: 6px;
          font-size: 16px;
          box-sizing: border-box;
        }
        input[type="file"] {
          font-size: 14px;
          width: 100%;
        }
        button {
          padding: 12px 20px;
          font-size: 16px;
          margin-top: 20px;
          cursor: pointer;
        }
        canvas {
          max-width: 100%;
          height: auto;
          border: 1px solid #ccc;
          margin-top: 20px;
        }
      `}</style>

      <div style={{ padding: 20 }}>
        <h1>취향표 만들기</h1>
        <div className="grid-container">
          {items.map((item, index) => (
            <div key={index} className="input-box">
              <input
                type="text"
                placeholder={`제목 ${index + 1}`}
                value={item.title}
                onChange={(e) => handleTitleChange(index, e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(index, e.target.files?.[0])}
              />
            </div>
          ))}
        </div>

        <button onClick={drawCollage}>이미지 생성</button>
        <button onClick={handleDownload}>다운로드</button>

        <canvas ref={canvasRef} width={600} height={400} />
      </div>
    </>
  );
};

export default App;
