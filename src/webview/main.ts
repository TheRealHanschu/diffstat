import { addedPercent } from "../format.ts";
import type { ChangeGroup, GroupId, RepoStats } from "../git.ts";
import type { FileChange, LineTotals } from "../numstat.ts";
import type { ToExtension, ToWebview } from "../protocol.ts";

interface VsCodeApi {
  postMessage(message: ToExtension): void;
  getState(): State | undefined;
  setState(state: State): void;
}
interface State {
  collapsed: string[];
}
declare function acquireVsCodeApi(): VsCodeApi;

const GROUP_LABELS: Record<GroupId, string> = { all: "Changes", staged: "Staged Changes", unstaged: "Changes" };

const STATUS_LABELS: Record<FileChange["status"], string> = { A: "Added", C: "Copied", D: "Deleted", M: "Modified", R: "Renamed", T: "Type changed", U: "Conflict", X: "Unknown", "?": "Untracked" };

const vscode = acquireVsCodeApi();
const root = document.getElementById("root")!;
const collapsed = new Set(vscode.getState()?.collapsed ?? []);
let repos: RepoStats[] = [];

window.addEventListener("message", (event: MessageEvent<ToWebview>) => {
  if (event.data.type === "update") {
    repos = event.data.repos;
    render();
  }
});
root.addEventListener("keydown", onKeyDown);
vscode.postMessage({ type: "ready" });

function render(): void {
  const focusedKey = (document.activeElement as HTMLElement | null)?.dataset.key;
  root.replaceChildren();

  if (repos.length === 0) {
    root.append(el("p", "empty", "No Git repositories found in this workspace."));
    return;
  }

  for (const stats of repos) {
    const repoKey = `repo:${stats.root}`;
    const name = stats.root.split(/[\\/]/).pop() ?? stats.root;
    const hasChanges = stats.total.files > 0;
    root.append(headerRow(repoKey, 0, name, stats.total, hasChanges, stats.root, "repo"));
    if (!hasChanges || collapsed.has(repoKey)) {
      continue;
    }
    if (stats.groups.length === 1) {
      appendFiles(stats.root, stats.groups[0], 1);
      continue;
    }
    for (const group of stats.groups.filter((g) => g.files > 0)) {
      const groupKey = `group:${stats.root}:${group.id}`;
      root.append(headerRow(groupKey, 1, GROUP_LABELS[group.id], group, true, undefined, "group"));
      if (!collapsed.has(groupKey)) {
        appendFiles(stats.root, group, 2);
      }
    }
  }

  const rows = [...root.querySelectorAll<HTMLElement>(".row")];
  const focused = rows.find((row) => row.dataset.key === focusedKey);
  if (focused) {
    focused.focus();
  }
  // Keep exactly one row in the tab order.
  (focused ?? rows[0])?.setAttribute("tabindex", "0");
}

function headerRow(key: string, level: number, label: string, totals: LineTotals, expandable: boolean, title: string | undefined, kind: "repo" | "group"): HTMLElement {
  const row = el("div", `row ${kind}`);
  row.dataset.key = key;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(level + 1));
  row.style.setProperty("--level", String(level));
  row.tabIndex = -1;
  row.title = title ?? label;

  const twistie = el("span", "twistie");
  if (expandable) {
    const isCollapsed = collapsed.has(key);
    row.setAttribute("aria-expanded", String(!isCollapsed));
    twistie.classList.add(isCollapsed ? "collapsed" : "expanded");
    row.addEventListener("click", () => toggle(key));
  }
  row.append(twistie, el("span", "name", label));

  if (totals.files === 0) {
    row.append(el("span", "dir", "no changes"));
  } else {
    const files = totals.files === 1 ? "1 file" : `${totals.files} files`;
    row.append(el("span", "dir", files), stats(totals.added, totals.removed));
  }
  row.append(el("span", "action-spacer"));
  return row;
}

function appendFiles(repoRoot: string, group: ChangeGroup, level: number): void {
  for (const change of group.changes) {
    root.append(fileRow(repoRoot, group.id, change, level));
  }
}

function fileRow(repoRoot: string, group: GroupId, change: FileChange, level: number): HTMLElement {
  const slash = change.path.lastIndexOf("/");
  const name = change.path.slice(slash + 1);
  const dir = slash >= 0 ? change.path.slice(0, slash) : "";
  const request = { root: repoRoot, group, path: change.path };

  const row = el("div", `row file status-${change.status === "?" ? "untracked" : change.status}`);
  row.dataset.key = `file:${repoRoot}:${group}:${change.path}`;
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", String(level + 1));
  row.style.setProperty("--level", String(level));
  row.tabIndex = -1;
  row.title = tooltip(change);
  row.addEventListener("click", () => vscode.postMessage({ type: "openChange", ...request }));

  row.append(el("span", "twistie"), el("span", "name", name), el("span", "dir", dir));

  if (change.added === null || change.removed === null) {
    const binary = el("span", "stats");
    binary.append(el("span", "binary", "binary"), bar(null));
    row.append(binary);
  } else {
    row.append(stats(change.added, change.removed));
  }

  if (change.status !== "D") {
    const open = el("button", "open-file");
    open.title = "Open File";
    open.setAttribute("aria-label", `Open ${name}`);
    open.tabIndex = -1;
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: "openFile", ...request });
    });
    row.append(open);
  } else {
    row.append(el("span", "action-spacer"));
  }
  return row;
}

function stats(added: number, removed: number): HTMLElement {
  const container = el("span", "stats");
  const counts = el("span", "counts");
  counts.append(el("span", "added", `+${added}`), el("span", "removed", `−${removed}`));
  container.append(counts, bar(addedPercent(added, removed)));
  return container;
}

function bar(percentAdded: number | null): HTMLElement {
  const container = el("span", "bar");
  container.setAttribute("aria-hidden", "true");
  if (percentAdded !== null) {
    const added = el("span", "bar-added");
    const removed = el("span", "bar-removed");
    added.style.width = `${percentAdded}%`;
    removed.style.width = `${100 - percentAdded}%`;
    container.append(added, removed);
  }
  return container;
}

function tooltip(change: FileChange): string {
  const lines = [`${change.path} · ${STATUS_LABELS[change.status]}`];
  if (change.oldPath) {
    lines.push(`from ${change.oldPath}`);
  }
  if (change.added === null || change.removed === null) {
    lines.push("Binary file");
  } else {
    const percent = addedPercent(change.added, change.removed);
    const share = percent === null ? "" : ` (${Math.round(percent)}% added)`;
    lines.push(`+${change.added} −${change.removed} lines${share}`);
  }
  return lines.join("\n");
}

function toggle(key: string): void {
  if (!collapsed.delete(key)) {
    collapsed.add(key);
  }
  vscode.setState({ collapsed: [...collapsed] });
  render();
}

function onKeyDown(event: KeyboardEvent): void {
  const row = (event.target as HTMLElement).closest<HTMLElement>(".row");
  if (!row) {
    return;
  }
  const rows = [...root.querySelectorAll<HTMLElement>(".row")];
  const index = rows.indexOf(row);
  const expanded = row.getAttribute("aria-expanded");

  switch (event.key) {
    case "ArrowDown":
      moveFocus(row, rows[index + 1]);
      break;
    case "ArrowUp":
      moveFocus(row, rows[index - 1]);
      break;
    case "Home":
      moveFocus(row, rows[0]);
      break;
    case "End":
      moveFocus(row, rows[rows.length - 1]);
      break;
    case "ArrowRight":
      if (expanded === "false") {
        row.click();
      }
      break;
    case "ArrowLeft":
      if (expanded === "true") {
        row.click();
      }
      break;
    case "Enter":
    case " ":
      row.click();
      break;
    default:
      return;
  }
  event.preventDefault();
}

function moveFocus(from: HTMLElement, to: HTMLElement | undefined): void {
  if (!to) {
    return;
  }
  from.tabIndex = -1;
  to.tabIndex = 0;
  to.focus();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}
