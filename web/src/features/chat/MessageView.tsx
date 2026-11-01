import { memo, type JSX } from "react";
import type { ChatMessage } from "@/api/session-types";
import { isRecord } from "@/api/guards";
import type { TranscriptClasses } from "./classes";
import { MarkdownBody } from "./MarkdownBody";
import { MessageImage } from "./MessageImage";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallView, ToolResultView } from "./ToolCallView";
import { contentBlocks, joinClassNames, roleLabel } from "./transcript";

export interface MessageViewProps {
  message: ChatMessage;
  classes: TranscriptClasses;
  toolResults?: ReadonlyMap<string, ChatMessage>;
  sessionId?: string | null;
  entryId?: string | null;
  streaming?: boolean;
}

interface BodyProps {
  message: ChatMessage;
  classes: TranscriptClasses;
  toolResults: ReadonlyMap<string, ChatMessage> | undefined;
  sessionId: string | null;
  entryId: string | null;
  streaming: boolean;
}

function AssistantBody({ message, classes, toolResults, sessionId, entryId, streaming }: BodyProps): JSX.Element {
  const blocks = contentBlocks(message.content);
  if (blocks.length === 0) return <></>;
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "text":
            return <MarkdownBody key={`text-${index}`} text={block.text} classes={classes} />;
          case "thinking":
            return (
              <ThinkingBlock
                key={`thinking-${index}`}
                text={block.thinking}
                classes={classes}
                deferred={block.deferred}
                sessionId={sessionId}
                entryId={entryId}
                blockIndex={index}
                timestamp={typeof message.timestamp === "number" ? message.timestamp : null}
                duration={typeof message.duration === "number" ? message.duration : null}
                streaming={streaming && index === blocks.length - 1}
              />
            );
          case "toolCall":
            return (
              <ToolCallView
                key={`tool-${index}-${block.toolCallId}`}
                call={block}
                classes={classes}
                result={toolResults?.get(block.toolCallId) ?? null}
                streaming={streaming}
              />
            );
          case "image":
            return <MessageImage key={`image-${index}`} image={block} classes={classes} />;
        }
      })}
    </>
  );
}

function UserBody({ message, classes }: { message: ChatMessage; classes: TranscriptClasses }): JSX.Element {
  const blocks = contentBlocks(message.content);
  if (blocks.length === 0) return <p className={classes.muted}>(no content)</p>;
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return <MarkdownBody key={`text-${index}`} text={block.text} classes={classes} />;
        }
        if (block.type === "image") {
          return <MessageImage key={`image-${index}`} image={block} classes={classes} />;
        }
        return null;
      })}
    </>
  );
}

function ToolResultBody({ message, classes }: { message: ChatMessage; classes: TranscriptClasses }): JSX.Element {
  const toolName = typeof message.toolName === "string" ? message.toolName : null;
  return (
    <div className={classes.standaloneResult}>
      {toolName !== null && toolName !== "" ? (
        <span className={classes.toolResultName}>{toolName}</span>
      ) : null}
      <ToolResultView
        content={message.content}
        classes={classes}
        isError={message.isError === true}
        partial={message.partial === true}
      />
    </div>
  );
}

function BashBody({ message, classes }: { message: ChatMessage; classes: TranscriptClasses }): JSX.Element {
  const command = typeof message.command === "string" ? message.command : "";
  const output = typeof message.output === "string" ? message.output : "";
  const cancelled = message.cancelled === true;
  const exitCode = typeof message.exitCode === "number" ? message.exitCode : null;
  const failed = cancelled || (exitCode !== null && exitCode !== 0);
  return (
    <div className={classes.execution}>
      {command !== "" ? <pre className={classes.command}>{command}</pre> : null}
      {output !== "" ? <pre className={classes.output}>{output}</pre> : null}
      {command === "" && output === "" ? <p className={classes.muted}>(no output)</p> : null}
      {cancelled ? (
        <span className={joinClassNames(classes.badge, classes.badgeMuted)}>cancelled</span>
      ) : exitCode !== null ? (
        <span className={joinClassNames(classes.badge, failed ? classes.badgeError : classes.badgeOk)}>
          exit {exitCode}
        </span>
      ) : null}
    </div>
  );
}

function PythonBody({ message, classes }: { message: ChatMessage; classes: TranscriptClasses }): JSX.Element {
  const code = typeof message.code === "string" ? message.code : "";
  const output = typeof message.output === "string" ? message.output : "";
  return (
    <div className={classes.execution}>
      {code !== "" ? <pre className={classes.command}>{code}</pre> : null}
      {output !== "" ? <pre className={classes.output}>{output}</pre> : null}
      {code === "" && output === "" ? <p className={classes.muted}>(no output)</p> : null}
    </div>
  );
}

function fileList(message: ChatMessage): string[] {
  const raw = message.files;
  if (!Array.isArray(raw)) return [];
  const files: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item !== "") {
      files.push(item);
      continue;
    }
    if (!isRecord(item)) continue;
    if (typeof item.path === "string" && item.path !== "") files.push(item.path);
    else if (typeof item.name === "string" && item.name !== "") files.push(item.name);
  }
  return files;
}

function TextualBody({ message, classes }: { message: ChatMessage; classes: TranscriptClasses }): JSX.Element {
  const blocks = contentBlocks(message.content);
  const files = fileList(message);
  const hasImages = blocks.some((block) => block.type === "image");
  const hasText = blocks.some((block) => block.type === "text" && block.text.trim() !== "");
  if (!hasText && !hasImages && files.length === 0) {
    return <p className={classes.muted}>(no content)</p>;
  }
  return (
    <div className={joinClassNames(classes.textual, classes.subdued)}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return <MarkdownBody key={`text-${index}`} text={block.text} classes={classes} />;
        }
        if (block.type === "image") {
          return <MessageImage key={`image-${index}`} image={block} classes={classes} />;
        }
        return null;
      })}
      {files.length > 0 ? (
        <ul className={classes.files}>
          {files.map((file) => (
            <li key={file} className={classes.file}>
              {file}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MessageBody({
  message,
  classes,
  toolResults,
  sessionId,
  entryId,
  streaming,
}: BodyProps): JSX.Element {
  const role = typeof message.role === "string" ? message.role : "";
  switch (role) {
    case "assistant":
      return (
        <AssistantBody
          message={message}
          classes={classes}
          toolResults={toolResults}
          sessionId={sessionId}
          entryId={entryId}
          streaming={streaming}
        />
      );
    case "user":
      return <UserBody message={message} classes={classes} />;
    case "toolResult":
    case "tool":
      return <ToolResultBody message={message} classes={classes} />;
    case "bashExecution":
      return <BashBody message={message} classes={classes} />;
    case "pythonExecution":
      return <PythonBody message={message} classes={classes} />;
    case "custom":
    case "developer":
    case "fileMention":
    default:
      return <TextualBody message={message} classes={classes} />;
  }
}

function sameToolResults(
  message: ChatMessage,
  prev: ReadonlyMap<string, ChatMessage> | undefined,
  next: ReadonlyMap<string, ChatMessage> | undefined,
): boolean {
  if (message.role !== "assistant") return true;
  for (const block of contentBlocks(message.content)) {
    if (block.type !== "toolCall") continue;
    if ((prev?.get(block.toolCallId) ?? null) !== (next?.get(block.toolCallId) ?? null)) return false;
  }
  return true;
}

function sameMessageView(prev: MessageViewProps, next: MessageViewProps): boolean {
  return (
    prev.message === next.message &&
    prev.classes === next.classes &&
    (prev.streaming ?? false) === (next.streaming ?? false) &&
    (prev.sessionId ?? null) === (next.sessionId ?? null) &&
    (prev.entryId ?? null) === (next.entryId ?? null) &&
    sameToolResults(next.message, prev.toolResults, next.toolResults)
  );
}

/** One complete transcript row: role label plus the message body. */
export const MessageView = memo(function MessageView({
  message,
  classes,
  toolResults,
  sessionId,
  entryId,
  streaming = false,
}: MessageViewProps): JSX.Element {
  const role = typeof message.role === "string" ? message.role : "";
  return (
    <article
      className={joinClassNames(classes.message, streaming && classes.messageStreaming)}
      data-role={role}
      data-streaming={streaming ? "true" : "false"}
    >
      <span className={classes.role}>{roleLabel(role)}</span>
      <div className={classes.body}>
        <MessageBody
          message={message}
          classes={classes}
          toolResults={toolResults}
          sessionId={sessionId ?? null}
          entryId={entryId ?? null}
          streaming={streaming}
        />
        {streaming ? <span className={classes.streamingCursor} aria-hidden="true" /> : null}
      </div>
    </article>
  );
}, sameMessageView);
