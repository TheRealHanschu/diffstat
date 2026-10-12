import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { FileChange } from "./numstat.ts";
import type { OpenRequest, ToExtension, ToWebview } from "./protocol.ts";
import type { StatsTracker } from "./tracker.ts";

const TITLE = "Line Changes";

export interface OpenHandlers {
  openChange(request: OpenRequest, change: FileChange): Promise<void>;
  openFile(request: OpenRequest, change: FileChange): Promise<void>;
}

export class LineChangesView implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly extensionUri: vscode.Uri;
  private readonly tracker: StatsTracker;
  private readonly handlers: OpenHandlers;
  private readonly log: vscode.LogOutputChannel;
  private view?: vscode.WebviewView;
  private viewDisposables: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri, tracker: StatsTracker, handlers: OpenHandlers, log: vscode.LogOutputChannel) {
    this.extensionUri = extensionUri;
    this.tracker = tracker;
    this.handlers = handlers;
    this.log = log;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.disposeView();
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist"), vscode.Uri.joinPath(this.extensionUri, "media")] };
    view.webview.html = this.html(view.webview);
    this.viewDisposables.push(
      view.webview.onDidReceiveMessage((message: ToExtension) => this.onMessage(message)),
      view.onDidChangeVisibility(() => this.updateHeader()),
      view.onDidDispose(() => {
        if (this.view === view) {
          this.disposeView();
        }
      }),
    );
    this.update();
  }

  update(): void {
    if (!this.view) {
      return;
    }
    this.updateHeader();
    const message: ToWebview = { type: "update", repos: this.tracker.all };
    void this.view.webview.postMessage(message);
  }

  private updateHeader(): void {
    if (!this.view) {
      return;
    }
    const repos = this.tracker.all;
    const added = repos.reduce((sum, stats) => sum + stats.total.added, 0);
    const removed = repos.reduce((sum, stats) => sum + stats.total.removed, 0);
    const counts = repos.length > 0 ? `+${added} −${removed}` : undefined;
    this.view.description = counts;
    this.view.title = counts && !this.view.visible ? `${TITLE}  ${counts}` : TITLE;
  }

  dispose(): void {
    this.disposeView();
  }

  private disposeView(): void {
    vscode.Disposable.from(...this.viewDisposables).dispose();
    this.viewDisposables = [];
    this.view = undefined;
  }

  private async onMessage(message: ToExtension): Promise<void> {
    if (message.type === "ready") {
      this.update();
      return;
    }
    const change = this.tracker.all
      .find((stats) => stats.root === message.root)
      ?.groups.find((group) => group.id === message.group)
      ?.changes.find((c) => c.path === message.path);
    if (!change) {
      return;
    }
    try {
      if (message.type === "openChange") {
        await this.handlers.openChange(message, change);
      } else {
        await this.handlers.openFile(message, change);
      }
    } catch (error) {
      this.log.error(`Failed to open ${message.path}:`, error);
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("base64");
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "view.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style}">
  <title>Line Changes</title>
</head>
<body>
  <div id="root" role="tree" aria-label="Line changes"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
