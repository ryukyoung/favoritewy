import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SoloEditor from "./pages/SoloEditor";
import MultiEditor from "./pages/MultiEditor";
import Result from "./pages/Result";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/solo" element={<SoloEditor />} />
      <Route path="/multi" element={<MultiEditor />} />
      <Route path="/result" element={<Result />} />
    </Routes>
  );
}
