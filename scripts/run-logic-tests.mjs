import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import path from 'path'

const here = path.dirname(fileURLToPath(import.meta.url))
const entry = path.join(here, 'logic.test.ts')
const out = path.join(here, '.logic-test.mjs')

await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  logLevel: 'warning',
})

await import(out + '?t=' + Date.now())