import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import DocsPage from "./pages/DocsPage";
import EditorPage from "./pages/EditorPage";
import MonkeyAgentEditorPage from "./pages/MonkeyAgentEditorPage";
import MonkeyAgentsNetworkPage from "./pages/MonkeyAgentsNetworkPage";
import ContextEditorPage from "./pages/ContextEditorPage";
import SignUpPage from "./pages/SignUpPage";
import FreeSignupPage from "./pages/FreeSignupPage";
import ConfirmEmailPage from "./pages/ConfirmEmailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LoginPage from "./pages/LoginPage.tsx";
import GuidePage from "./pages/GuidePage";
import TrialEditorPage from "./pages/TrialEditorPage.tsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/signup/free" element={<FreeSignupPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/drive" element={<DocsPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/doc/:id" element={<EditorPage />} />
        <Route path="/trial" element={<TrialEditorPage />} />
        <Route path="/context/:id" element={<ContextEditorPage />} />
        <Route path="/monkey-agents-network" element={<MonkeyAgentsNetworkPage />} />
        <Route path="/monkey-agent/:id" element={<MonkeyAgentEditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
