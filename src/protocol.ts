import type { GroupId, RepoStats } from "./git.ts";
import type { ChangeStatus } from "./numstat.ts";

export type ViewMode = "list" | "tree";

export type SortOrder = "path" | "changes" | "added";

export type ToWebview = { type: "update"; repos: RepoStats[]; viewMode: ViewMode; sortBy: SortOrder };

export type OpenRequest = { root: string; group: GroupId; path: string };

export type ToExtension = { type: "ready" } | ({ type: "openChange" } & OpenRequest) | ({ type: "openFile" } & OpenRequest);

/** The `data-vscode-context` of a file row: its keys are context keys for the menu, and the commands receive it. */
export type FileContext = OpenRequest & { webviewSection: "file"; status: ChangeStatus };
