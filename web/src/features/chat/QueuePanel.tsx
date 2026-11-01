import type { JSX } from "react";
import type { QueueClasses } from "./classes";

export interface QueuePanelProps {
  queue: { steering: string[]; followUp: string[] };
  classes: QueueClasses;
  pending?: boolean;
  onRemove: (queue: "steering" | "followUp", text: string) => void | Promise<void>;
  onPromote: (text: string) => void | Promise<void>;
}

export function QueuePanel({
  queue,
  classes,
  pending = false,
  onRemove,
  onPromote,
}: QueuePanelProps): JSX.Element | null {
  const total = queue.steering.length + queue.followUp.length;
  if (total === 0) return null;

  return (
    <section className={classes.panel} aria-label="Queued messages">
      <header className={classes.header}>Queue ({total})</header>
      {queue.steering.length > 0 ? (
        <div className={classes.group}>
          <span className={classes.groupLabel}>Steering</span>
          <ul className={classes.list}>
            {queue.steering.map((text, index) => (
              <li key={`steering-${index}`} className={classes.row}>
                <span className={classes.text}>{text}</span>
                <button
                  type="button"
                  className={classes.remove}
                  onClick={() => void onRemove("steering", text)}
                  aria-label={`Remove ${text}`}
                  disabled={pending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {queue.followUp.length > 0 ? (
        <div className={classes.group}>
          <span className={classes.groupLabel}>Follow-up</span>
          <ul className={classes.list}>
            {queue.followUp.map((text, index) => (
              <li key={`followUp-${index}`} className={classes.row}>
                <span className={classes.text}>{text}</span>
                <button
                  type="button"
                  className={classes.promote}
                  onClick={() => void onPromote(text)}
                  aria-label={`Steer ${text}`}
                  disabled={pending}
                >
                  Steer
                </button>
                <button
                  type="button"
                  className={classes.remove}
                  onClick={() => void onRemove("followUp", text)}
                  aria-label={`Remove ${text}`}
                  disabled={pending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
