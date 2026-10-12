import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { countLines, parseRawNumstat, sumChanges, type FileChange, type LineTotals } from "./numstat.ts";

export interface StatsOptions {
  includeUntracked: boolean;
  splitStaged: boolean;
}

export type GroupId = "all" | "staged" | "unstaged";

export interface ChangeGroup extends LineTotals {
  id: GroupId;
  changes: FileChange[];
}

export interface RepoStats {
  root: string;
  total: LineTotals;
  changes: FileChange[];
  groups: ChangeGroup[];
}

/** Untracked files larger than this are listed without line counts. */
const MAX_UNTRACKED_FILE_SIZE = 20 * 1024 * 1024;
const UNTRACKED_BATCH_SIZE = 32;

const DIFF_ARGS = ["diff", "--raw", "--numstat", "-z", "--find-renames", "--no-ext-diff", "--no-color"];

export async function getRepoStats(gitPath: string, root: string, options: StatsOptions): Promise<RepoStats> {
  const base = await resolveBase(gitPath, root);
  const untracked = options.includeUntracked ? await getUntrackedChanges(gitPath, root) : [];

  const all = sortByPath([...(await diff(gitPath, root, [base])), ...untracked]);
  const groups = options.splitStaged
    ? [toGroup("staged", await diff(gitPath, root, ["--cached", base])), toGroup("unstaged", [...(await diff(gitPath, root, [])), ...untracked])]
    : [toGroup("all", all)];

  return { root, total: sumChanges(all), changes: all, groups };
}

async function diff(gitPath: string, root: string, args: string[]): Promise<FileChange[]> {
  const output = await runGit(gitPath, root, [...DIFF_ARGS, ...args, "--"]);
  return parseRawNumstat(output);
}

async function resolveBase(gitPath: string, root: string): Promise<string> {
  try {
    return (await runGit(gitPath, root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"])).trim();
  } catch {
    return (await runGit(gitPath, root, ["hash-object", "-t", "tree", "--stdin"], "")).trim();
  }
}

async function getUntrackedChanges(gitPath: string, root: string): Promise<FileChange[]> {
  const output = await runGit(gitPath, root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const paths = output.split("\0").filter((p) => p !== "");
  const changes: FileChange[] = [];
  for (let i = 0; i < paths.length; i += UNTRACKED_BATCH_SIZE) {
    const batch = paths.slice(i, i + UNTRACKED_BATCH_SIZE);
    changes.push(...(await Promise.all(batch.map((p) => countUntracked(root, p)))));
  }
  return changes;
}

async function countUntracked(root: string, relativePath: string): Promise<FileChange> {
  const change: FileChange = { path: relativePath, status: "?", added: null, removed: null };
  try {
    const fullPath = path.join(root, relativePath);
    if ((await stat(fullPath)).size <= MAX_UNTRACKED_FILE_SIZE) {
      const added = countLines(await readFile(fullPath));
      change.added = added;
      change.removed = added === null ? null : 0;
    }
  } catch {
    // Deleted between listing and reading: keep it without counts.
  }
  return change;
}

function toGroup(id: GroupId, changes: FileChange[]): ChangeGroup {
  return { id, changes: sortByPath(changes), ...sumChanges(changes) };
}

function sortByPath(changes: FileChange[]): FileChange[] {
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

export function runGit(gitPath: string, cwd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, args, { cwd, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        const message = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`git ${args[0]} exited with code ${code}${message ? `: ${message}` : ""}`));
      }
    });
    child.stdin.end(input);
  });
}
