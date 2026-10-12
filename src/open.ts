import * as path from "node:path";
import * as vscode from "vscode";
import type { GroupId } from "./git.ts";
import type { API } from "./gitApi.ts";
import type { FileChange } from "./numstat.ts";

export function fileUri(root: string, change: FileChange): vscode.Uri {
  return vscode.Uri.file(path.join(root, change.path));
}

export async function openChange(git: API, root: string, group: GroupId, change: FileChange): Promise<void> {
  const right = fileUri(root, change);
  const left = change.oldPath ? vscode.Uri.file(path.join(root, change.oldPath)) : right;
  const name = path.posix.basename(change.path);

  const leftRef = group === "unstaged" ? "~" : "HEAD";
  const rightUri = group === "staged" ? git.toGitUri(right, "") : right;
  const rightLabel = group === "staged" ? "Index" : "Working Tree";

  if (change.status === "?" || (change.status === "A" && group !== "staged")) {
    await vscode.commands.executeCommand("vscode.open", right);
  } else if (change.status === "A") {
    await vscode.commands.executeCommand("vscode.open", rightUri);
  } else if (change.status === "D") {
    await vscode.commands.executeCommand("vscode.open", git.toGitUri(left, leftRef));
  } else {
    const leftLabel = group === "unstaged" ? "Index" : "HEAD";
    await vscode.commands.executeCommand("vscode.diff", git.toGitUri(left, leftRef), rightUri, `${name} (${leftLabel} ↔ ${rightLabel})`);
  }
}
