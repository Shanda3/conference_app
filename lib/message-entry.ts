import type {KeyboardEvent} from "react";

export const messageTypingHint = "Enter for a new line · Ctrl+Enter or ⌘+Enter to send.";

// Keep normal Enter and input-method composition available for writing messages.
export function submitMessageShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 || event.key !== "Enter" ||
      (!event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const field = event.currentTarget;
  if (!field.disabled && field.value.trim()) field.form?.requestSubmit();
}

// Browser/keyboard preferences still control available dictionaries and corrections.
export const messageTypingProps = {
  "data-devyo-message-draft": true,
  spellCheck: true,
  autoCorrect: "on",
  autoCapitalize: "sentences",
  "aria-keyshortcuts": "Control+Enter Meta+Enter",
  onKeyDown: submitMessageShortcut,
} as const;
