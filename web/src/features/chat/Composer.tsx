import {
  useEffect,
  useRef,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { QueueIcon, SendIcon, SteerIcon, StopIcon } from "./icons";
import type { ComposerSubmitMode } from "@/slots/chat";
import type { ComposerClasses } from "./classes";

export type { ComposerSubmitMode };

export interface ComposerProps {
  value: string;
  classes: ComposerClasses;
  onChange: (value: string) => void;
  onSubmit: (text: string, mode: ComposerSubmitMode) => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
  running: boolean;
  pending?: boolean;
  dropActive?: boolean;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  submitLabel?: string;
  controls?: ReactNode;
  status?: ReactNode;
  hint?: string;
}

const IDLE_HINT = "Enter to send · Shift+Enter newline";
const RUNNING_HINT = "Enter to queue · Ctrl+Enter to steer · Shift+Enter newline";

export function Composer({
  value,
  classes,
  onChange,
  onSubmit,
  onAbort,
  running,
  pending = false,
  dropActive = false,
  disabled = false,
  error = null,
  placeholder = "Message or run a task, / commands, @ files…",
  submitLabel,
  controls,
  status,
  hint,
}: ComposerProps): JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blocked = disabled || pending;
  const empty = value.trim().length === 0;
  const defaultHint = status ? undefined : running ? RUNNING_HINT : IDLE_HINT;
  const visibleHint = hint ?? defaultHint;
  const abort = onAbort;
  const handleAbort = () => {
    if (abort) void abort();
  };

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    const max = typeof window === "undefined" ? 320 : Math.max(120, window.innerHeight * 0.4);
    const next = Math.min(node.scrollHeight, max);
    node.style.height = next > 0 ? `${next}px` : "";
    node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const submit = (mode: ComposerSubmitMode) => {
    const text = value.trim();
    if (!text || blocked) return;
    void onSubmit(text, mode);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (running) {
      submit(event.ctrlKey || event.metaKey ? "steer" : "followUp");
    } else {
      submit("send");
    }
  };

  return (
    <div className={classes.wrap}>
      <div className={dropActive ? `${classes.composer} ${classes.composerDrop}` : classes.composer}>
        <textarea
          ref={inputRef}
          className={classes.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          spellCheck={false}
          aria-label="Message"
          disabled={disabled}
        />
        <div className={classes.footer}>
          <div className={classes.controls}>
            {controls}
          </div>
          <div className={classes.actions}>
            {running ? (
              <>
                {abort ? (
                  <button
                    type="button"
                    className={classes.stop}
                    onClick={handleAbort}
                    aria-label="Stop"
                    title="Stop"
                    disabled={disabled}
                  >
                    <StopIcon size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={classes.ghost}
                  onClick={() => submit("steer")}
                  aria-label="Steer"
                  title="Steer (Ctrl+Enter)"
                  disabled={blocked || empty}
                >
                  <SteerIcon size={13} />
                  <span>Steer</span>
                </button>
                <button
                  type="button"
                  className={classes.queue}
                  onClick={() => submit("followUp")}
                  aria-label="Queue"
                  title="Queue (Enter)"
                  disabled={blocked || empty}
                >
                  <QueueIcon size={13} />
                  <span>Queue</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className={classes.send}
                onClick={() => submit("send")}
                aria-label={submitLabel ?? "Send"}
                title={submitLabel ? submitLabel : "Send (Enter)"}
                disabled={blocked || empty}
              >
                <SendIcon size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
      {status ? <div className={classes.stats}>{status}</div> : null}
      {visibleHint ? <span className={classes.hint}>{visibleHint}</span> : null}
      {error ? (
        <p className={classes.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
