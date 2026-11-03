import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FileChange } from '../src/numstat.ts';
import { buildTree, sortChanges, type TreeNode } from '../src/tree.ts';

function change(path: string, added: number | null, removed: number | null): FileChange {
  return { path, status: 'M', added, removed };
}

const changes = [
  change('README.md', 1, 1),
  change('src/a.ts', 10, 2),
  change('src/b.ts', 1, 30),
  change('src/webview/main.ts', 5, 0),
  change('src/webview/view.css', null, null),
  change('test/unit/deep/x.test.ts', 4, 0),
];

/** Flattens a tree into `name +added -removed` lines, indented by depth. */
function outline(nodes: TreeNode[], depth = 0): string[] {
  return nodes.flatMap(node =>
    node.kind === 'file'
      ? [`${'  '.repeat(depth)}${node.change.path.split('/').pop()}`]
      : [`${'  '.repeat(depth)}${node.name}/ +${node.added} -${node.removed} (${node.files})`, ...outline(node.children, depth + 1)],
  );
}

test('sorts a flat list by path, lines changed or lines added', () => {
  assert.deepEqual(sortChanges(changes, 'path').map(c => c.path), changes.map(c => c.path));
  assert.deepEqual(
    sortChanges(changes, 'changes').map(c => c.path),
    ['src/b.ts', 'src/a.ts', 'src/webview/main.ts', 'test/unit/deep/x.test.ts', 'README.md', 'src/webview/view.css'],
  );
  assert.deepEqual(
    sortChanges(changes, 'added').map(c => c.path),
    ['src/a.ts', 'src/webview/main.ts', 'test/unit/deep/x.test.ts', 'README.md', 'src/b.ts', 'src/webview/view.css'],
  );
});

test('groups files by folder with totals, folders first and single-folder chains merged', () => {
  assert.deepEqual(outline(buildTree(changes, 'path')), [
    'src/ +16 -32 (4)',
    '  webview/ +5 -0 (2)',
    '    main.ts',
    '    view.css',
    '  a.ts',
    '  b.ts',
    'test/unit/deep/ +4 -0 (1)',
    '  x.test.ts',
    'README.md',
  ]);
});

test('sorts each tree level by the chosen order', () => {
  const tree = buildTree([...changes, change('big/file.ts', 100, 0)], 'changes');
  assert.deepEqual(outline(tree).filter(line => !line.startsWith(' ')), ['big/ +100 -0 (1)', 'src/ +16 -32 (4)', 'test/unit/deep/ +4 -0 (1)', 'README.md']);
  const src = tree.find(node => node.kind === 'folder' && node.name === 'src');
  assert.deepEqual(outline(src?.kind === 'folder' ? src.children : []).filter(line => !line.startsWith(' ')), ['webview/ +5 -0 (2)', 'b.ts', 'a.ts']);
});

test('keeps the full path of merged folders', () => {
  const [folder] = buildTree([change('a/b/c.ts', 1, 0)], 'path');
  assert.equal(folder.kind === 'folder' && folder.path, 'a/b');
});
