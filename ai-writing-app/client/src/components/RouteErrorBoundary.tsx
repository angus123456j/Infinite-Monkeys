import React from "react";

type Props = {
  children: React.ReactNode;
  label?: string;
};

type State = {
  error: unknown;
  info: React.ErrorInfo | null;
};

export default class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: unknown) {
    return { error, info: null };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.setState({ error, info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

    return (
      <div
        style={{
          padding: "24px",
          fontFamily: "Cormorant Garamond, serif",
          background: "#fff",
          color: "#1a1a1a",
        }}
      >
        <div style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: 8 }}>
          Something crashed while opening {this.props.label ?? "this page"}
        </div>
        <div style={{ opacity: 0.9, marginBottom: 14 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 0,
              border: "1px solid rgba(179, 134, 45, 0.9)",
              background: "rgba(255,255,255,0.85)",
              fontFamily: "Cormorant Garamond, serif",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
        {info?.componentStack && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(0,0,0,0.03)",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
            }}
          >
            {info.componentStack}
          </pre>
        )}
      </div>
    );
  }
}

