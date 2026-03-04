import { useEffect, useRef } from "react";

interface GuideProps {
  isOpen: boolean;
  onClose: () => void;
}

function Guide({ isOpen, onClose }: GuideProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handleClick), 50);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="guide-backdrop">
      <div ref={modalRef} className="guide-modal">
        <div className="guide-header">
          <h2 className="guide-title">How to Use Infinite Monkeys</h2>
          <button className="guide-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="guide-body">
          <section className="guide-section">
            <h3>Writing</h3>
            <ul>
              <li>Start typing anywhere on the page. It works just like a regular document editor.</li>
              <li>Pages grow automatically as you write.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>Formatting</h3>
            <ul>
              <li><strong>Bold</strong> — <kbd>Cmd+B</kbd></li>
              <li><strong>Italic</strong> — <kbd>Cmd+I</kbd></li>
              <li><strong>Underline</strong> — <kbd>Cmd+U</kbd></li>
              <li>Change <strong>font family</strong>, <strong>font size</strong>, and <strong>paragraph style</strong> from the toolbar dropdowns.</li>
              <li>Use the <strong>text color</strong> and <strong>highlight color</strong> pickers to style your text.</li>
              <li>Create <strong>bullet lists</strong> and <strong>numbered lists</strong> with the list buttons.</li>
              <li><strong>Undo / Redo</strong> — <kbd>Cmd+Z</kbd> / <kbd>Cmd+Shift+Z</kbd></li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>Summon Infinite Monkeys (AI Rewrite)</h3>
            <ol>
              <li><strong>Select</strong> the text you want rewritten.</li>
              <li>Press <kbd>Cmd+K</kbd> — your selection will be highlighted and the Summon overlay appears.</li>
              <li>Type your instruction (e.g. "make it more formal", "simplify this", "translate to French").</li>
              <li>Press <kbd>Enter</kbd> or click <strong>Summon</strong>.</li>
              <li>The overlay closes and you can <strong>keep writing</strong> while the rewrite is generated in the background.</li>
              <li>The rewritten text appears <strong>inline below</strong> your original text.</li>
            </ol>
          </section>

          <section className="guide-section">
            <h3>Reviewing Suggestions</h3>
            <ul>
              <li>When a rewrite appears, you can <strong>edit it</strong> before accepting — click on the suggestion text and make changes.</li>
              <li>Click <strong>Accept</strong> to replace your original text with the rewrite.</li>
              <li>Click <strong>Reject</strong> to discard the suggestion and keep your original text.</li>
              <li>You can have <strong>multiple rewrites</strong> running at the same time — select different text and press <kbd>Cmd+K</kbd> again.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>Tips</h3>
            <ul>
              <li>The Summon overlay is <strong>draggable</strong> — grab the title bar to move it anywhere on screen.</li>
              <li>Press <kbd>Shift+Enter</kbd> in the prompt to write multi-line instructions.</li>
              <li>Press <kbd>Esc</kbd> to cancel the overlay without summoning.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Guide;
