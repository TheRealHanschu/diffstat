import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { findFileChange } from "../src/fileLookup.ts";
import type { RepoStats } from "../src/git.ts";
import type { FileChange } from "../src/numstat.ts";

function repo(root: string, paths: string[]): RepoStats {
  const changes: FileChange[] = paths.map((p) => ({ path: p, status: "M", added: 1, removed: 0 }));
  return { root, total: { added: paths.length, removed: 0, files: paths.length }, changes, groups: [] };
}

test("finds a changed file inside a repository", () => {
  const repos = [repo("/work/app", ["src/app.ts", "README.md"])];
  assert.equal(findFileChange(repos, "/work/app/src/app.ts", path.posix)?.change.path, "src/app.ts");
  assert.equal(findFileChange(repos, "/work/app/README.md", path.posix)?.change.path, "README.md");
});

test("returns nothing for unchanged files and files outside repositories", () => {
  const repos = [repo("/work/app", ["src/app.ts"])];
  assert.equal(findFileChange(repos, "/work/app/src/other.ts", path.posix), undefined);
  assert.equal(findFileChange(repos, "/work/other/src/app.ts", path.posix), undefined);
  assert.equal(findFileChange(repos, "/work/app-two/src/app.ts", path.posix), undefined);
  assert.equal(findFileChange(repos, "/work/app", path.posix), undefined);
});

test("prefers the innermost of nested repositories", () => {
  const repos = [repo("/work/app", ["lib/inner/x.ts"]), repo("/work/app/lib/inner", ["x.ts"])];
  const match = findFileChange(repos, "/work/app/lib/inner/x.ts", path.posix);
  assert.equal(match?.repo.root, "/work/app/lib/inner");
  assert.equal(match?.change.path, "x.ts");
});

test("matches Windows paths regardless of case and separators", () => {
  const repos = [repo("C:\\work\\App", ["src/Main.ts"])];
  assert.equal(findFileChange(repos, "c:\\work\\app\\src\\main.ts", path.win32)?.change.path, "src/Main.ts");
  assert.equal(findFileChange(repos, "C:\\work\\App\\src\\Other.ts", path.win32), undefined);
});
