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

// Build webview bundle for production
const CssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  entryPoints: ['src/webview/app.tsx'],
  bundle: true,
  platform: 'browser',
  target: ['chrome58'],
  outfile: path.join(outdir, 'webview.js'),
  sourcemap: false,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    CssModulesPlugin()
  ]
}).catch((err) => {
  console.error('webview build failed', err);
  process.exit(1);
});
