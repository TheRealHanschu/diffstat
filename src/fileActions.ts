import * as path from "node:path";
import * as vscode from "vscode";
import type { API, Repository } from "./gitApi.ts";
import type { FileChange } from "./numstat.ts";
import { fileUri, openChange, openFile } from "./open.ts";
import type { FileContext } from "./protocol.ts";
import type { StatsTracker } from "./tracker.ts";

type FileAction = (context: FileContext, change: FileChange) => Thenable<unknown>;

/** Registers the commands in the context menu of a file in the Line Changes view. */
export function registerFileActions(git: API, tracker: StatsTracker, log: vscode.LogOutputChannel): vscode.Disposable {
  const repository = (context: FileContext): Repository => {
    const repo = tracker.repository(context.root);
    if (!repo) {
      throw new Error(`No open repository at ${context.root}`);
    }
    return repo;
  };

  const actions: Record<string, FileAction> = {
    "diffstat.openChange": (context, change) => openChange(git, context.root, context.group, change),
    "diffstat.openFile": (context, change) => openFile(context.root, change),
    "diffstat.stage": (context, change) => repository(context).add(paths(context.root, change)),
    "diffstat.unstage": (context, change) => repository(context).revert(paths(context.root, change)),
    "diffstat.discard": async (context, change) => {
      if (await confirmDiscard(change)) {
        await repository(context).clean(paths(context.root, change));
      }
    },
    "diffstat.copyPath": (context, change) => vscode.commands.executeCommand("copyFilePath", fileUri(context.root, change)),
    "diffstat.copyRelativePath": (context, change) => vscode.commands.executeCommand("copyRelativeFilePath", fileUri(context.root, change)),
    "diffstat.revealInExplorer": (context, change) => vscode.commands.executeCommand("revealInExplorer", fileUri(context.root, change)),
  };

  return vscode.Disposable.from(
    ...Object.entries(actions).map(([id, action]) =>
      vscode.commands.registerCommand(id, async (context?: FileContext) => {
        const change = context && tracker.findChange(context);
        if (!change) {
          return;
        }
        try {
          await action(context, change);
        } catch (error) {
          log.error(`${id} failed for ${context.path}:`, error);
          void vscode.window.showErrorMessage(`Diffstat: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    ),
  );
}

/** A rename is staged or unstaged together with its old path. */
function paths(root: string, change: FileChange): string[] {
  return [change.path, change.oldPath].filter((p) => p !== undefined).map((p) => path.join(root, p));
}

async function confirmDiscard(change: FileChange): Promise<boolean> {
  const name = path.posix.basename(change.path);
  const [message, detail, action] =
    change.status === "?"
      ? [`Delete '${name}'?`, "This file isn't tracked by git.", "Delete File"]
      : [`Discard the changes in '${name}'?`, "Changes that aren't staged will be lost. Staged changes are kept.", "Discard Changes"];
  return (await vscode.window.showWarningMessage(message, { modal: true, detail }, action)) === action;
}
