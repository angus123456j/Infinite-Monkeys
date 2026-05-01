import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef } from "react";

export default function SuggestionBlockView(props: NodeViewProps) {
  const { node, extension, editor } = props;
  const attrs = node.attrs as {
    rewriteId: number;
    monkeyId: string;
    status: "loading" | "ready" | "error";
    title: string;
    text: string;
    error: string | null;
  };

  const pinnedText = attrs.text ?? "";
  const isLoading = attrs.status === "loading";
  const isError = attrs.status === "error";
  const textElRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedTextRef = useRef<string>("");
  const draftTextRef = useRef<string>(pinnedText);

  const onAccept = () => {
    // Ensure any in-place edits are captured before applying.
    commitDraftToNode();
    try {
      window.dispatchEvent(new CustomEvent("im:suggestion-accept", { detail: { rewriteId: attrs.rewriteId } }));
    } catch {
      /* ignore */
    }
    const cb = (extension.options as any)?.onAccept as ((id: number) => void) | undefined;
    cb?.(attrs.rewriteId);
  };
  const onReject = () => {
    // Persist edits so returning to the card keeps them.
    commitDraftToNode();
    try {
      window.dispatchEvent(new CustomEvent("im:suggestion-reject", { detail: { rewriteId: attrs.rewriteId } }));
    } catch {
      /* ignore */
    }
    const cb = (extension.options as any)?.onReject as ((id: number) => void) | undefined;
    cb?.(attrs.rewriteId);
  };

  const commitDraftToNode = () => {
    if (isLoading || isError) return;
    const next = draftTextRef.current ?? "";
    if (next === pinnedText) return;
    editor.commands.updateSuggestionBlock(attrs.rewriteId, { text: next });
  };

  useEffect(() => {
    const el = textElRef.current;
    if (!el) return;
    if (isLoading || isError) return;
    // If the user is actively editing inside the element, don't stomp their selection.
    const isActive = document.activeElement === el;
    if (isActive) return;
    if (lastAppliedTextRef.current !== pinnedText) {
      el.innerText = pinnedText;
      lastAppliedTextRef.current = pinnedText;
      draftTextRef.current = pinnedText;
    }
  }, [pinnedText, isLoading, isError]);

  return (
    <NodeViewWrapper className="im-suggestion-node" data-rewrite-id={attrs.rewriteId}>
      <div className="im-suggestion-node__head">
        <div className="im-suggestion-node__title">
          <span className="im-suggestion-node__arrow" aria-hidden>
            ↪
          </span>
          <span className="im-suggestion-node__label">{attrs.title || "Rewritten:"}</span>
          {attrs.monkeyId ? (
            <span className="im-suggestion-node__meta">Monkey {attrs.monkeyId}</span>
          ) : null}
        </div>
        <div className="im-suggestion-node__actions">
          <button
            type="button"
            className="im-suggestion-node__btn im-suggestion-node__btn--accept"
            onClick={onAccept}
            disabled={isLoading || isError || !pinnedText.trim()}
          >
            ✓ Accept
          </button>
          <button
            type="button"
            className="im-suggestion-node__btn im-suggestion-node__btn--reject"
            onClick={onReject}
          >
            ✕ Reject
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="im-suggestion-node__body im-suggestion-node__body--loading">
          <span className="im-suggestion-node__spinner" aria-hidden />
          <span>{(attrs.title || "").toLowerCase().includes("expand") ? "Expanding…" : "Rewriting…"}</span>
        </div>
      ) : isError ? (
        <div className="im-suggestion-node__body im-suggestion-node__body--error">
          {attrs.error || "Rewrite failed."}
        </div>
      ) : (
        <div className="im-suggestion-node__body">
          <div
            className="im-suggestion-node__text"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            ref={(el) => {
              textElRef.current = el as HTMLDivElement | null;
              if (!el) return;
              // Initial mount
              el.innerText = pinnedText;
              lastAppliedTextRef.current = pinnedText;
              draftTextRef.current = pinnedText;
            }}
            onInput={(e) => {
              draftTextRef.current = (e.target as HTMLElement).innerText;
            }}
            onKeyDown={(e) => {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/e7e07eac-9415-495e-a623-d26d2f751fe5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7e6622'},body:JSON.stringify({sessionId:'7e6622',runId:'pre-fix',hypothesisId:'H4',location:'SuggestionBlockView.tsx:onKeyDown',message:'editable_keydown',data:{key:e.key,code:(e as any).code,inputType:(e as any).inputType ?? null,isComposing:(e as any).isComposing ?? null},timestamp:Date.now()})}).catch(()=>{});
              // #endregion agent log
            }}
            onBlur={() => {
              commitDraftToNode();
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

