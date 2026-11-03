import type { FileChange, LineTotals } from "./numstat.ts";
import type { SortOrder } from "./protocol.ts";

export interface FolderNode extends LineTotals {
  kind: "folder";
  /** Repository-relative path, without a trailing slash. */
  path: string;
  /** Folders with a single subfolder are merged, so this can be `src/webview`. */
  name: string;
  children: TreeNode[];
}

export interface FileNode {
  kind: "file";
  change: FileChange;
}

export type TreeNode = FolderNode | FileNode;

export function sortChanges(changes: readonly FileChange[], sortBy: SortOrder): FileChange[] {
  return [...changes].sort((a, b) => compareTotals(sortBy, fileTotals(a), fileTotals(b)) || a.path.localeCompare(b.path));
}

/** Groups changes by folder, with folders first and each level sorted. */
export function buildTree(changes: readonly FileChange[], sortBy: SortOrder): TreeNode[] {
  const root = folder("", "");
  const folders = new Map<string, FolderNode>([["", root]]);
  for (const change of changes) {
    const parts = change.path.split("/");
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      let child = folders.get(folderPath);
      if (!child) {
        child = folder(folderPath, parts[i]);
        folders.set(folderPath, child);
        parent.children.push(child);
      }
      parent = child;
    }
    parent.children.push({ kind: "file", change });
  }
  return finish(root, sortBy).children;
}

function finish(node: FolderNode, sortBy: SortOrder): FolderNode {
  node.children = node.children.map((child) => (child.kind === "folder" ? compact(finish(child, sortBy)) : child));
  for (const child of node.children) {
    const totals = nodeTotals(child);
    node.added += totals.added;
    node.removed += totals.removed;
    node.files += totals.files;
  }
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }
    return compareTotals(sortBy, nodeTotals(a), nodeTotals(b)) || nodeName(a).localeCompare(nodeName(b));
  });
  return node;
}

function compact(node: FolderNode): FolderNode {
  const [only] = node.children;
  return node.children.length === 1 && only.kind === "folder" ? { ...only, name: `${node.name}/${only.name}` } : node;
}

function compareTotals(sortBy: SortOrder, a: LineTotals, b: LineTotals): number {
  switch (sortBy) {
    case "changes":
      return b.added + b.removed - (a.added + a.removed);
    case "added":
      return b.added - a.added;
    case "path":
      return 0;
  }
}

function folder(path: string, name: string): FolderNode {
  return { kind: "folder", path, name, children: [], added: 0, removed: 0, files: 0 };
}

function fileTotals(change: FileChange): LineTotals {
  return { added: change.added ?? 0, removed: change.removed ?? 0, files: 1 };
}

function nodeTotals(node: TreeNode): LineTotals {
  return node.kind === "folder" ? node : fileTotals(node.change);
}

function nodeName(node: TreeNode): string {
  return node.kind === "folder" ? node.name : node.change.path.slice(node.change.path.lastIndexOf("/") + 1);
}
