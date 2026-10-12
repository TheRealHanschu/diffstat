export type ChangeStatus = "A" | "C" | "D" | "M" | "R" | "T" | "U" | "X" | "?";

export interface FileChange {
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  added: number | null;
  removed: number | null;
}

export interface LineTotals {
  added: number;
  removed: number;
  files: number;
}

export function parseRawNumstat(output: string): FileChange[] {
  const tokens = output.split("\0");
  const changes: FileChange[] = [];
  const byPath = new Map<string, FileChange>();
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i++];
    if (token === "") {
      continue;
    }

    if (token.startsWith(":")) {
      const status = (token.split(" ")[4]?.[0] ?? "M") as ChangeStatus;
      let path = tokens[i++];
      let oldPath: string | undefined;
      if (status === "R" || status === "C") {
        oldPath = path;
        path = tokens[i++];
      }
      const change: FileChange = { path, oldPath, status, added: 0, removed: 0 };
      changes.push(change);
      byPath.set(path, change);
      continue;
    }

    const firstTab = token.indexOf("\t");
    const secondTab = token.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) {
      continue;
    }
    const added = token.slice(0, firstTab);
    const removed = token.slice(firstTab + 1, secondTab);
    let path = token.slice(secondTab + 1);
    let oldPath: string | undefined;
    if (path === "") {
      oldPath = tokens[i++];
      path = tokens[i++];
    }

    let change = byPath.get(path);
    if (!change) {
      change = { path, oldPath, status: oldPath ? "R" : "M", added: 0, removed: 0 };
      changes.push(change);
      byPath.set(path, change);
    }
    change.added = added === "-" ? null : Number(added);
    change.removed = removed === "-" ? null : Number(removed);
  }

  return changes;
}

export function countLines(content: Uint8Array): number | null {
  if (content.subarray(0, 8000).includes(0)) {
    return null;
  }
  let lines = 0;
  for (const byte of content) {
    if (byte === 10) {
      lines++;
    }
  }
  if (content.length > 0 && content[content.length - 1] !== 10) {
    lines++;
  }
  return lines;
}

export function sumChanges(changes: readonly FileChange[]): LineTotals {
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    added += change.added ?? 0;
    removed += change.removed ?? 0;
  }
  return { added, removed, files: changes.length };
}
