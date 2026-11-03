import * as vscode from "vscode";
import { CurrentFileStatusBar } from "./currentFile.ts";
import { registerFileActions } from "./fileActions.ts";
import type { API, GitExtension } from "./gitApi.ts";
import { openChange, openFile } from "./open.ts";
import type { SortOrder, ViewMode } from "./protocol.ts";
import { LineChangesStatusBar } from "./statusBar.ts";
import { StatsTracker } from "./tracker.ts";
import { LineChangesView } from "./view.ts";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel("Diffstat", { log: true });
  context.subscriptions.push(log);

  const git = await getGitApi(context);
  if (!git) {
    log.warn("The built-in Git extension is disabled or unavailable.");
    return;
  }

  const tracker = new StatsTracker(git, log);
  const statusBar = new LineChangesStatusBar(tracker);
  const currentFile = new CurrentFileStatusBar(tracker);
  const view = new LineChangesView(
    context.extensionUri,
    tracker,
    {
      openChange: (request, change) => openChange(git, request.root, request.group, change),
      openFile: (request, change) => openFile(request.root, change),
    },
    log,
  );

  context.subscriptions.push(
    tracker,
    statusBar,
    currentFile,
    view,
    vscode.window.registerWebviewViewProvider("diffstat.view", view),
    tracker.onDidChange(() => {
      view.update();
      statusBar.update();
      currentFile.update();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("diffstat.statusBar")) {
        statusBar.update();
        currentFile.update();
      }
      if (event.affectsConfiguration("diffstat.includeUntracked") || event.affectsConfiguration("diffstat.splitStagedChanges")) {
        tracker.refreshAll();
      }
      if (event.affectsConfiguration("diffstat.viewMode") || event.affectsConfiguration("diffstat.sortBy")) {
        view.update();
      }
    }),
    registerFileActions(git, tracker, log),
    vscode.commands.registerCommand("diffstat.refresh", () => tracker.refreshAll()),
    vscode.commands.registerCommand("diffstat.viewAsTree", () => setViewMode("tree")),
    vscode.commands.registerCommand("diffstat.viewAsList", () => setViewMode("list")),
    vscode.commands.registerCommand("diffstat.sortBy", pickSortOrder),
    vscode.commands.registerCommand("diffstat.openCurrentFileChange", async () => {
      const match = currentFile.current;
      if (match) {
        await openChange(git, match.repo.root, "all", match.change);
      }
    }),
  );
}

export function deactivate(): void {}

const SORT_ORDERS: { value: SortOrder; label: string }[] = [
  { value: "path", label: "Path" },
  { value: "changes", label: "Lines Changed" },
  { value: "added", label: "Lines Added" },
];

async function setViewMode(mode: ViewMode): Promise<void> {
  await vscode.workspace.getConfiguration("diffstat").update("viewMode", mode, vscode.ConfigurationTarget.Global);
}

async function pickSortOrder(): Promise<void> {
  const config = vscode.workspace.getConfiguration("diffstat");
  const current = config.get<SortOrder>("sortBy", "path");
  const items = SORT_ORDERS.map((order) => ({ ...order, description: order.value === current ? "current" : undefined }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: "Sort changed files by" });
  if (picked && picked.value !== current) {
    await config.update("sortBy", picked.value, vscode.ConfigurationTarget.Global);
  }
}

async function getGitApi(context: vscode.ExtensionContext): Promise<API | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) {
    return undefined;
  }
  const gitExtension = extension.isActive ? extension.exports : await extension.activate();
  if (!gitExtension.enabled) {
    await new Promise<void>((resolve) => {
      const listener = gitExtension.onDidChangeEnablement((enabled) => {
        if (enabled) {
          listener.dispose();
          resolve();
        }
      });
      context.subscriptions.push(listener);
    });
  }
  return gitExtension.getAPI(1);
}
