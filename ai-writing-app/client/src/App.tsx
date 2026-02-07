import Editor from "./components/Editor";

const MENU_ITEMS = ["File", "Edit", "View", "Insert", "Format", "Tools", "Extensions", "Help"];

function App() {
  return (
    <div className="app">
      <div className="title-bar">
        <svg className="doc-icon" width="24" height="30" viewBox="0 0 24 24" fill="#4285f4">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
        </svg>
        <div className="title-area">
          <input className="doc-title" defaultValue="Untitled document" />
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

export default App;
