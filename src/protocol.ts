import type { GroupId, RepoStats } from "./git.ts";

export type ToWebview = { type: "update"; repos: RepoStats[] };

export type OpenRequest = { root: string; group: GroupId; path: string };

export type ToExtension = { type: "ready" } | ({ type: "openChange" } & OpenRequest) | ({ type: "openFile" } & OpenRequest);
