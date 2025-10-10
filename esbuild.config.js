const esbuild = require('esbuild');
const path = require('path');

const outdir = path.resolve(__dirname, 'out');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(outdir, 'extension.js'),
  sourcemap: true,
  external: [
    'vscode'
  ],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

// Build the webview bundle (preact) as a separate browser-targeted file
const CssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  entryPoints: ['src/webview/app.tsx'],
  bundle: true,
  platform: 'browser',
  target: ['chrome58','firefox57','safari11'],
  outfile: path.join(outdir, 'webview.js'),
  sourcemap: true,
  minify: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    CssModulesPlugin({
      localIdentName: '[name]__[local]___[hash:base64:5]',
    })
  ]
}).catch((err) => {
  console.error('webview build failed', err);
  process.exit(1);
});
