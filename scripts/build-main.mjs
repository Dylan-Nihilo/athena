import { build } from 'esbuild';
export async function buildMain() {
  await build({
    entryPoints: ['src/main/main.ts'],
    outfile: 'dist/main/main.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    minify: true,
    external: ['electron'],
    sourcemap: true,
  });
  await build({
    entryPoints: ['src/main/preload.ts'],
    outfile: 'dist/main/preload.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    minify: true,
    external: ['electron'],
  });
}
if (process.argv[1]?.endsWith('build-main.mjs')) await buildMain();
