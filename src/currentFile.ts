import * as path from "node:path";
import * as vscode from "vscode";
import { findFileChange, type FileMatch } from "./fileLookup.ts";
import { formatCounts } from "./format.ts";
import type { StatsTracker } from "./tracker.ts";

export class CurrentFileStatusBar implements vscode.Disposable {
  private readonly tracker: StatsTracker;
  private readonly addedItem: vscode.StatusBarItem;
  private readonly removedItem: vscode.StatusBarItem; 
  private readonly disposables: vscode.Disposable[] = [];
  private match: FileMatch | undefined;

  constructor(tracker: StatsTracker) {
    this.tracker = tracker;
    this.addedItem = createItem("diffstat.currentFile.added", "Current File Lines Added", 100, "gitDecoration.addedResourceForeground");
    this.removedItem = createItem("diffstat.currentFile.removed", "Current File Lines Removed", 99.999, "gitDecoration.deletedResourceForeground");
    this.disposables.push(
      this.addedItem,
      this.removedItem,
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
    );
    this.update();
  }

  get current(): FileMatch | undefined {
    return this.match;
  }

  update(): void {
    const enabled = vscode.workspace.getConfiguration("diffstat").get("statusBar.currentFile", true);
    const uri = vscode.window.activeTextEditor?.document.uri;
    this.match = enabled && uri?.scheme === "file" ? findFileChange(this.tracker.all, uri.fsPath) : undefined;

    const change = this.match?.change;
    if (!change || change.added === null || change.removed === null || change.added + change.removed === 0) {
      this.addedItem.hide();
      this.removedItem.hide();
      return;
    }

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown("**");
    tooltip.appendText(path.posix.basename(change.path));
    tooltip.appendMarkdown(`** since the last commit\n\n${formatCounts(change.added, change.removed)}\n\n`);
    tooltip.appendMarkdown("Counts saved changes. Click to open the diff.");

    this.addedItem.text = `$(file) +${change.added}`;
    this.removedItem.text = `−${change.removed}`;
    for (const item of [this.addedItem, this.removedItem]) {
      item.tooltip = tooltip;
      item.show();
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}

function createItem(id: string, name: string, priority: number, color: string): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Right, priority);
  item.name = name;
  item.color = new vscode.ThemeColor(color);
  item.command = "diffstat.openCurrentFileChange";
  return item;
}
