import * as path from "node:path";
import * as vscode from "vscode";
import { formatTotals } from "./format.ts";
import type { StatsTracker } from "./tracker.ts";

export class LineChangesStatusBar implements vscode.Disposable {
  private readonly tracker: StatsTracker;
  private readonly addedItem: vscode.StatusBarItem;
  private readonly removedItem: vscode.StatusBarItem;

  constructor(tracker: StatsTracker) {
    this.tracker = tracker;
    this.addedItem = createItem("diffstat.added", "Lines Added", 0, "gitDecoration.addedResourceForeground");
    this.removedItem = createItem("diffstat.removed", "Lines Removed", -0.001, "gitDecoration.deletedResourceForeground");
    this.update();
  }

  update(): void {
    const enabled = vscode.workspace.getConfiguration("diffstat").get("statusBar.enabled", true);
    const all = this.tracker.all;
    if (!enabled || all.length === 0) {
      this.addedItem.hide();
      this.removedItem.hide();
      return;
    }

    let added = 0;
    let removed = 0;
    for (const stats of all) {
      added += stats.total.added;
      removed += stats.total.removed;
    }

    const tooltip = new vscode.MarkdownString("**Lines changed since the last commit**\n\n");
    for (const stats of all) {
      tooltip.appendMarkdown(`- ${path.basename(stats.root)}: ${formatTotals(stats.total)}\n`);
    }

    this.addedItem.text = `$(diff) +${added}`;
    this.removedItem.text = `−${removed}`;
    for (const item of [this.addedItem, this.removedItem]) {
      item.tooltip = tooltip;
      item.show();
    }
  }

  dispose(): void {
    this.addedItem.dispose();
    this.removedItem.dispose();
  }
}

function createItem(id: string, name: string, priority: number, color: string): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Left, priority);
  item.name = name;
  item.color = new vscode.ThemeColor(color);
  item.command = "diffstat.view.focus";
  return item;
}
