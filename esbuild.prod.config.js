const esbuild = require('esbuild');
const path = require('path');

const outdir = path.resolve(__dirname, 'out');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(outdir, 'extension.js'),
  sourcemap: false,
  minify: true,
  external: [
    'vscode'
  ],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
