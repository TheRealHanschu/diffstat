import * as path from "node:path";
import type { RepoStats } from "./git.ts";
import type { FileChange } from "./numstat.ts";

export interface FileMatch {
  repo: RepoStats;
  change: FileChange;
}

export function findFileChange(repos: readonly RepoStats[], filePath: string, pathApi: path.PlatformPath = path): FileMatch | undefined {
  let repo: RepoStats | undefined;
  let relative = "";
  for (const candidate of repos) {
    const rel = pathApi.relative(candidate.root, filePath);
    const inside = rel !== "" && rel !== ".." && !rel.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(rel);
    if (inside && (!repo || candidate.root.length > repo.root.length)) {
      repo = candidate;
      relative = rel;
    }
  }
  if (!repo) {
    return undefined;
  }

  const gitPath = relative.split(pathApi.sep).join("/");
  let change = repo.changes.find((c) => c.path === gitPath);
  if (!change && pathApi === path.win32) {
    const lower = gitPath.toLowerCase();
    change = repo.changes.find((c) => c.path.toLowerCase() === lower);
  }
  return change && { repo, change };
}
