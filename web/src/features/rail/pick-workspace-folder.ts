interface DirectoryPickerHost {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

/** The browser's own folder dialog. Cancel returns null. */
export async function pickBrowserFolder(): Promise<string | null> {
  const open = (window as Window & DirectoryPickerHost).showDirectoryPicker;
  if (typeof open !== "function") throw new Error("This browser has no folder dialog");
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await open.call(window);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") return null;
    throw cause;
  }
  const direct = readPath(handle);
  if (direct) return direct;
  const fromFile = await pathFromFirstFile(handle);
  if (fromFile) return fromFile;
  throw new Error(`The browser did not share a path for ${handle.name}`);
}

function readPath(value: object): string | null {
  const record = value as { path?: unknown; fullPath?: unknown };
  if (typeof record.path === "string" && record.path.trim() !== "") return record.path;
  if (typeof record.fullPath === "string" && record.fullPath.trim() !== "") return record.fullPath;
  return null;
}

async function pathFromFirstFile(handle: FileSystemDirectoryHandle): Promise<string | null> {
  for await (const entry of handle.values()) {
    if (entry.kind !== "file") continue;
    const file = await entry.getFile();
    const full = readPath(file);
    if (!full) return null;
    const slash = Math.max(full.lastIndexOf("/"), full.lastIndexOf("\\"));
    return slash > 0 ? full.slice(0, slash) : null;
  }
  return null;
}
