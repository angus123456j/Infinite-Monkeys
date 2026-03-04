import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Editor from "../components/Editor";
import MonkeyScene from "../components/MonkeyScene";
import { getDoc, updateDocTitle } from "../lib/docs";

const MENU_ITEMS = ["File", "Edit", "View", "Insert", "Format", "Tools", "Extensions", "Help"];

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("Untitled document");

  useEffect(() => {
    if (id) {
      const meta = getDoc(id);
      if (meta) setTitle(meta.title);
    }
  }, [id]);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTitle(v);
    if (id) updateDocTitle(id, v);
  }

  return (
    <div className="app">
      <div className="app-top-bar" aria-hidden="true">
        <MonkeyScene />
      </div>
      <div className="title-bar">
        <Link to="/docs" className="doc-icon-link" title="Back to documents">
          <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
          </svg>
        </Link>
        <div className="title-area">
          <input
            className="doc-title"
            value={title}
            onChange={handleTitleChange}
            aria-label="Document title"
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
      <Editor />
    </div>
  );
}
