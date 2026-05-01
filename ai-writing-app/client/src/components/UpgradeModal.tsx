import { useNavigate } from "react-router-dom";

type UpgradeModalProps = {
  open: boolean;
  reason: string;
  onClose: () => void;
};

export default function UpgradeModal({ open, reason, onClose }: UpgradeModalProps) {
  const navigate = useNavigate();
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(5, 10, 18, 0.62)",
        backdropFilter: "blur(2px)",
      }}
      role="dialog"
      aria-label="Upgrade required"
    >
      <div
        style={{
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: "rgba(245, 250, 255, 0.96)",
          border: "1px solid rgba(12, 35, 64, 0.45)",
          borderRadius: 0,
          padding: 16,
          fontFamily: '"Cormorant Garamond", serif',
          color: "rgba(6, 18, 33, 0.98)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(3, 14, 28, 0.98)" }}>
            Upgrade your plan
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 0,
              border: "1px solid rgba(12, 35, 64, 0.35)",
              background: "rgba(255, 255, 255, 0.5)",
              color: "rgba(6, 18, 33, 0.95)",
              cursor: "pointer",
              lineHeight: 1,
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.4, opacity: 0.92, color: "rgba(6, 18, 33, 0.92)" }}>
          {reason}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              padding: "0 14px",
              borderRadius: 0,
              border: "1px solid rgba(12, 35, 64, 0.35)",
              background: "rgba(255, 255, 255, 0.95)",
              color: "rgba(6, 18, 33, 0.95)",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/pricing");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              padding: "0 14px",
              borderRadius: 0,
              border: "1px solid rgba(175, 135, 45, 0.9)",
              background: "#ffffff",
              color: "rgba(145, 105, 28, 0.98)",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            View plans
          </button>
        </div>
      </div>
    </div>
  );
}
