import { useEffect, useRef } from "react";

interface GuideProps {
  isOpen: boolean;
  onClose: () => void;
}

function Guide({ isOpen, onClose }: GuideProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  // Emit events for onboarding tours.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!wasOpen && isOpen) {
      window.dispatchEvent(new CustomEvent("im:guide-open"));
    } else if (wasOpen && !isOpen) {
      window.dispatchEvent(new CustomEvent("im:guide-close"));
    }
  }, [isOpen]);

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
            <h3>1) Highlight text + Summon a monkey</h3>
            <ol>
              <li><strong>Select</strong> the text you want help with (it will highlight).</li>
              <li>Press <kbd>Cmd+K</kbd> to open <strong>Summon Infinite Monkeys</strong>.</li>
              <li>Type your instruction (e.g. “make it more formal”, “simplify this”, “translate to French”).</li>
              <li>Press <kbd>Enter</kbd> or click <strong>Summon</strong>.</li>
            </ol>
            <ul>
              <li>You can keep writing while it runs in the background.</li>
              <li>You can summon multiple times — select different text and press <kbd>Cmd+K</kbd> again.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>2) Move the Summon panel + write better prompts</h3>
            <ul>
              <li>The Summon overlay is <strong>draggable</strong> — grab the title bar to move it anywhere.</li>
              <li>Press <kbd>Shift+Enter</kbd> for multi-line prompts.</li>
              <li>Press <kbd>Esc</kbd> to close the overlay without summoning.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>3) (Optional) Attach Contexts</h3>
            <ul>
              <li>In the Summon overlay, use <strong>Context</strong> to pick up to 5 items from your Context Library.</li>
              <li>Contexts are reusable memory: tone, rules, voice, bans, references — attach them when you want the rewrite “on brief”.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>4) Timeline (what happened, step-by-step)</h3>
            <ul>
              <li>Turn on the <strong>Timeline</strong> to see every rewrite request and result.</li>
              <li>It shows which monkey ran, what prompt was used, and what came back — handy for tracing changes.</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>5) Orchestrator (advanced)</h3>
            <ul>
              <li>Use the <strong>Orchestrator</strong> when you want a multi-step rewrite using multiple specialist monkeys.</li>
              <li>It proposes a chain and runs it in order, so you can combine strengths (structure → style → tighten).</li>
            </ul>
          </section>

          <section className="guide-section">
            <h3>6) Editor basics</h3>
            <ul>
              <li>Start typing anywhere — pages grow automatically as you write.</li>
              <li><strong>Bold</strong> — <kbd>Cmd+B</kbd></li>
              <li><strong>Italic</strong> — <kbd>Cmd+I</kbd></li>
              <li><strong>Underline</strong> — <kbd>Cmd+U</kbd></li>
              <li>Use the toolbar for <strong>font</strong>, <strong>size</strong>, <strong>headings</strong>, <strong>lists</strong>, <strong>text color</strong>, and <strong>highlight</strong>.</li>
              <li><strong>Undo / Redo</strong> — <kbd>Cmd+Z</kbd> / <kbd>Cmd+Shift+Z</kbd></li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Guide;
