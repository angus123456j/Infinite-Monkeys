import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import Editor from "../components/Editor";
import MonkeyScene from "../components/MonkeyScene";
import { getContext, updateContext } from "../lib/contexts";

const MENU_ITEMS = ["File", "Edit", "View", "Insert", "Format", "Tools", "Extensions", "Help"];

export default function ContextEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("Untitled context");
  const [initialContent, setInitialContent] = useState<string>("<p></p>");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getContext(id)
      .then((ctx) => {
        if (ctx) {
          setTitle(ctx.title);
          setInitialContent(ctx.description || "<p></p>");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setTitle(v);
      if (id) void updateContext(id, { title: v });
    },
    [id]
  );

  const handleSaveContent = useCallback(
    (content: string) => {
      if (id) void updateContext(id, { description: content });
    },
    [id]
  );

  if (loading) {
    return (
      <div className="app">
        <div className="app-top-bar" aria-hidden="true">
          <MonkeyScene />
        </div>
        <div className="title-bar">
          <Link to="/docs" className="doc-icon-link" title="Back to drive">
            <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
            </svg>
          </Link>
          <div className="title-area">
            <span className="doc-title">Loading…</span>
          </div>
        </div>
        <div style={{ padding: "2rem", textAlign: "center" }}>Loading context…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-top-bar" aria-hidden="true">
        <MonkeyScene />
      </div>
      <div className="title-bar">
        <Link to="/docs?drive=context" className="doc-icon-link" title="Back to drive">
          <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
          </svg>
        </Link>
        <div className="title-area">
          <input
            className="doc-title"
            value={title}
            onChange={handleTitleChange}
            aria-label="Context title"
          />
          <div className="menu-bar">
            {MENU_ITEMS.map((item) => (
              <span key={item} className="menu-item">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Editor key={id} docId={id ?? undefined} initialContent={initialContent} onSaveContent={handleSaveContent} />
    </div>
  );
}

