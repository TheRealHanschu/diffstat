import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import { getRepoStats, runGit } from '../src/git.ts';

const GIT = 'git';
const roots: string[] = [];

async function createRepo(): Promise<{ root: string; git: (...args: string[]) => Promise<string> }> {
  const root = await mkdtemp(path.join(tmpdir(), 'diffstat-test-'));
  roots.push(root);
  const git = (...args: string[]) => runGit(GIT, root, args);
  await git('init', '--quiet');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'core.autocrlf', 'false');
  return { root, git };
}

let repo: Awaited<ReturnType<typeof createRepo>>;

before(async () => {
  repo = await createRepo();
  const { root, git } = repo;
  await writeFile(path.join(root, 'keep.txt'), 'a\nb\nc\n');
  await writeFile(path.join(root, 'remove.txt'), '1\n2\n');
  await writeFile(path.join(root, 'rename-me.txt'), 'x\ny\nz\nw\n');
  await git('add', '.');
  await git('commit', '--quiet', '-m', 'initial');

  // Staged: 1 line changed in keep.txt, then 1 more line added on top in the working tree.
  await writeFile(path.join(root, 'keep.txt'), 'a\nB\nc\n');
  await git('add', 'keep.txt');
  await writeFile(path.join(root, 'keep.txt'), 'a\nB\nc\nd\n');
  // Unstaged deletion.
  await rm(path.join(root, 'remove.txt'));
  // Staged rename.
  await git('mv', 'rename-me.txt', 'renamed.txt');
  // Untracked file and an ignored one.
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'sub', 'new.txt'), 'n1\nn2');
  await writeFile(path.join(root, '.gitignore'), 'ignored.txt\n');
  await writeFile(path.join(root, 'ignored.txt'), 'nope\n');
});

after(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })));
});

test('combined stats compare the working tree with HEAD', async () => {
  const stats = await getRepoStats(GIT, repo.root, { includeUntracked: true, splitStaged: false });

  assert.equal(stats.groups.length, 1);
  const byPath = Object.fromEntries(stats.groups[0].changes.map(c => [c.path, c]));
  assert.deepEqual(Object.keys(byPath).sort(), ['.gitignore', 'keep.txt', 'remove.txt', 'renamed.txt', 'sub/new.txt']);
  assert.deepEqual([byPath['keep.txt'].added, byPath['keep.txt'].removed], [2, 1]);
  assert.deepEqual([byPath['remove.txt'].status, byPath['remove.txt'].removed], ['D', 2]);
  assert.deepEqual([byPath['renamed.txt'].status, byPath['renamed.txt'].oldPath], ['R', 'rename-me.txt']);
  assert.deepEqual([byPath['sub/new.txt'].status, byPath['sub/new.txt'].added], ['?', 2]);
  assert.deepEqual(stats.total, { added: 2 + 2 + 1, removed: 1 + 2, files: 5 });
});

test('split stats separate staged and unstaged changes', async () => {
  const stats = await getRepoStats(GIT, repo.root, { includeUntracked: true, splitStaged: true });
  const [staged, unstaged] = stats.groups;

  assert.equal(staged.id, 'staged');
  assert.deepEqual(
    staged.changes.map(c => [c.path, c.added, c.removed]),
    [['keep.txt', 1, 1], ['renamed.txt', 0, 0]],
  );
  assert.equal(unstaged.id, 'unstaged');
  assert.deepEqual(
    unstaged.changes.map(c => [c.path, c.added, c.removed]),
    [['.gitignore', 1, 0], ['keep.txt', 1, 0], ['remove.txt', 0, 2], ['sub/new.txt', 2, 0]],
  );
  assert.deepEqual(stats.total, { added: 5, removed: 3, files: 5 });
  assert.deepEqual(
    stats.changes.map(c => [c.path, c.added, c.removed]),
    [['.gitignore', 1, 0], ['keep.txt', 2, 1], ['remove.txt', 0, 2], ['renamed.txt', 0, 0], ['sub/new.txt', 2, 0]],
  );
});

test('untracked files can be excluded', async () => {
  const stats = await getRepoStats(GIT, repo.root, { includeUntracked: false, splitStaged: false });
  assert.deepEqual(stats.total, { added: 2, removed: 3, files: 3 });
});

test('works in a repository without commits', async () => {
  const { root, git } = await createRepo();
  await writeFile(path.join(root, 'staged.txt'), '1\n2\n3\n');
  await git('add', 'staged.txt');
  await writeFile(path.join(root, 'untracked.txt'), 'u\n');

  const stats = await getRepoStats(GIT, root, { includeUntracked: true, splitStaged: false });
  assert.deepEqual(
    stats.groups[0].changes.map(c => [c.path, c.status, c.added]),
    [['staged.txt', 'A', 3], ['untracked.txt', '?', 1]],
  );
});
