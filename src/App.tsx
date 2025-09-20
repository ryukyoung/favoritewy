import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import SoloEditor from "./pages/SoloEditor";
import MultiEditor from "./pages/MultiEditor";
import Manual from "./pages/Manual";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/solo" element={<SoloEditor />} />
      <Route path="/multi" element={<MultiEditor />} />
      <Route path="/multi/:roomId" element={<MultiEditor />} />
      <Route path="/manual" element={<Manual />} />
    </Routes>
  );
}
