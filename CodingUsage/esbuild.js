const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');
const fs = require('fs');
const path = require('path');

// 自动从根目录复制英文版 README 作为扩展的 README
const sourceReadme = path.join(__dirname, '..', 'README_EN.md');
const targetReadme = path.join(__dirname, 'README.md');
if (fs.existsSync(sourceReadme)) {
  fs.copyFileSync(sourceReadme, targetReadme);
  console.log('✓ README copied from ../README_EN.md');
} else {
  console.warn('⚠ README_EN.md not found in parent directory');
}

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
const baseConfig = {
  bundle: true,
  minify: true, // 总是启用压缩
  sourcemap: false, // 生产环境不需要 sourcemap
  treeShaking: true, // 启用 tree shaking
  target: 'node16', // 指定目标 Node.js 版本
};

// Config for extension source code (to be run in a Node-based context)
const extensionConfig = {
  ...baseConfig,
  platform: 'node',
  mainFields: ['module', 'main'],
  format: 'cjs',
  entryPoints: ['./src/extension.ts'],
  outfile: './out/extension.js',
  external: ['vscode'],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  drop: ['console', 'debugger'],
  plugins: [
    copy({
      assets: [
        { from: 'node_modules/sql.js/dist/sql-wasm.wasm', to: './' }
      ]
    })
  ]
};

// Build start
console.log('Building...');

// Build extension
esbuild
  .build(extensionConfig)
  .then(() => {
    console.log('Build complete!');
  })
  .catch(() => process.exit(1));
