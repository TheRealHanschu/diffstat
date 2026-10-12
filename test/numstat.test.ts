import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countLines, parseRawNumstat, sumChanges } from '../src/numstat.ts';

const SHA = '0000000';

test('parses modified, added, deleted and binary files', () => {
  const output = [
    `:100644 100644 ${SHA} ${SHA} M`, 'src/a.ts',
    `:000000 100644 ${SHA} ${SHA} A`, 'new.txt',
    `:100644 000000 ${SHA} ${SHA} D`, 'old.txt',
    `:100644 100644 ${SHA} ${SHA} M`, 'logo.png',
    '10\t2\tsrc/a.ts',
    '3\t0\tnew.txt',
    '0\t7\told.txt',
    '-\t-\tlogo.png',
    '',
  ].join('\0');

  assert.deepEqual(parseRawNumstat(output), [
    { path: 'src/a.ts', oldPath: undefined, status: 'M', added: 10, removed: 2 },
    { path: 'new.txt', oldPath: undefined, status: 'A', added: 3, removed: 0 },
    { path: 'old.txt', oldPath: undefined, status: 'D', added: 0, removed: 7 },
    { path: 'logo.png', oldPath: undefined, status: 'M', added: null, removed: null },
  ]);
});

test('parses renames', () => {
  const output = [`:100644 100644 ${SHA} ${SHA} R087`, 'a/old.ts', 'b/new.ts', '4\t1\t', 'a/old.ts', 'b/new.ts', ''].join(
    '\0',
  );

  assert.deepEqual(parseRawNumstat(output), [
    { path: 'b/new.ts', oldPath: 'a/old.ts', status: 'R', added: 4, removed: 1 },
  ]);
});

test('keeps tabs in file names', () => {
  const output = [`:100644 100644 ${SHA} ${SHA} M`, 'a\tb.txt', '1\t1\ta\tb.txt', ''].join('\0');
  assert.deepEqual(parseRawNumstat(output), [
    { path: 'a\tb.txt', oldPath: undefined, status: 'M', added: 1, removed: 1 },
  ]);
});

test('returns nothing for empty output', () => {
  assert.deepEqual(parseRawNumstat(''), []);
});

test('counts lines like git', () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  assert.equal(countLines(encode('')), 0);
  assert.equal(countLines(encode('one')), 1);
  assert.equal(countLines(encode('one\n')), 1);
  assert.equal(countLines(encode('one\r\ntwo\r\n')), 2);
  assert.equal(countLines(encode('one\ntwo')), 2);
  assert.equal(countLines(new Uint8Array([65, 0, 66])), null);
});

test('sums changes, skipping binary files', () => {
  assert.deepEqual(
    sumChanges([
      { path: 'a', status: 'M', added: 5, removed: 1 },
      { path: 'b', status: 'M', added: null, removed: null },
      { path: 'c', status: '?', added: 2, removed: 0 },
    ]),
    { added: 7, removed: 1, files: 3 },
  );
});
