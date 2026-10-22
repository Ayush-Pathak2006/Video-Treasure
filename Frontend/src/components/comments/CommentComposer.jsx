import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const MAX_LENGTH = 1000;
const COUNTER_FROM = 900;

/**
 * The text box for a new comment, a reply or an edit. Cancel and the submit button show once it's focused or has
 * text, or always with `alwaysOpen` (replies and edits). Ctrl/Cmd+Enter sends. `onSubmit(text)` returns a promise;
 * its error message (the spam limit's 429, a validation error) shows under the box.
 */
function CommentComposer({
  placeholder,
  submitLabel = "Comment",
  initialText = "",
  autoFocus = false,
  alwaysOpen = false,
  onSubmit,
  onCancel,
}) {
  const [text, setText] = useState(initialText);
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);
  const open = alwaysOpen || focused || text.length > 0;
  const trimmed = text.trim();

  // Grows with its text.
  useLayoutEffect(() => {
    const element = textareaRef.current;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!autoFocus) return;
    const element = textareaRef.current;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [autoFocus]);

  const cancel = () => {
    setText(initialText);
    setError("");
    textareaRef.current.blur();
    onCancel?.();
  };

  const submit = async () => {
    if (!trimmed || sending) return;
    setSending(true);
    setError("");

    try {
      await onSubmit(trimmed);
      setText("");
      textareaRef.current?.blur();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Couldn't send your comment. Try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  // The buttons keep the focus in the box, so a click doesn't first blur it and hide them.
  const keepFocus = event => event.preventDefault();

  return (
    <div className="min-w-0 flex-1">
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        maxLength={MAX_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={event => setText(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        className="w-full resize-none overflow-hidden bg-transparent border-b border-white/20 py-1 text-sm placeholder:text-white/40 focus:border-purple-400 focus:outline-none"
      />

      {open && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {text.length >= COUNTER_FROM && (
            <span className={`mr-auto text-xs ${text.length >= MAX_LENGTH ? "text-pink-400" : "text-white/50"}`}>
              {text.length}/{MAX_LENGTH}
            </span>
          )}
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={cancel}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={submit}
            disabled={!trimmed || sending}
            className="rounded-full bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:bg-white/10 disabled:text-white/40"
          >
            {sending ? "Sending…" : submitLabel}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export default CommentComposer;
