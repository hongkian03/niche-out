import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const config = {
  configFile: false,
  root: path('./'),
  publicDir: path('../../../apps/web/public/'),
  logLevel: 'warn',
  build: { emptyOutDir: true, sourcemap: false },
  preview: { host: '127.0.0.1', port: 4177, strictPort: true, headers: { 'Cache-Control': 'no-store' } },
};

export async function buildAndServeMotion(port = 4177) {
  execFileSync(process.execPath, [path('../../../node_modules/typescript/bin/tsc'), '--project', path('./tsconfig.json')], { stdio: 'inherit' });
  const serveConfig = {
    ...config,
    build: { ...config.build, outDir: path(`../../../work/e7-motion/site-${port}/`) },
    preview: { ...config.preview, port },
  };
  await build(serveConfig);
  return preview(serveConfig);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await buildAndServeMotion();
  console.log(`Niche Out Motion Preview: http://127.0.0.1:${server.httpServer.address().port}/motion-preview/`);
}
