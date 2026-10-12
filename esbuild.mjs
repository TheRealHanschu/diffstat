import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'info',
};

const contexts = await Promise.all([
  esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/extension.js',
    external: ['vscode'],
  }),
  esbuild.context({
    ...shared,
    entryPoints: ['src/webview/main.ts'],
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    outfile: 'dist/webview.js',
  }),
]);

if (watch) {
  await Promise.all(contexts.map(context => context.watch()));
} else {
  await Promise.all(contexts.map(context => context.rebuild()));
  await Promise.all(contexts.map(context => context.dispose()));
}
