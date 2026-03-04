import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import DocsPage from "./pages/DocsPage";
import EditorPage from "./pages/EditorPage";
import SpecialistMonkeyPage from "./pages/SpecialistMonkeyPage";
import MonkeyAgentEditorPage from "./pages/MonkeyAgentEditorPage";
import ContextEditorPage from "./pages/ContextEditorPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/doc/:id" element={<EditorPage />} />
        <Route path="/context/:id" element={<ContextEditorPage />} />
        <Route path="/specialist-monkey" element={<SpecialistMonkeyPage />} />
        <Route path="/monkey-agent/:id" element={<MonkeyAgentEditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
