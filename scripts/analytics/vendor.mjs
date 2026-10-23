import { createHash } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderEventTypes } from './registry.mjs'

// Run from any directory: bun run scripts/analytics/vendor.mjs /path/to/analytics
const upstream = process.argv[2]
if (!upstream)
  throw new Error(
    'Usage: bun run scripts/analytics/vendor.mjs /path/to/analytics'
  )
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const publicDir = path.join(root, 'apps/web/public')
const manifestPath = path.join(publicDir, 'geo-analytics-manifest.json')
const oldManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const manifestBytes = readFileSync(path.join(upstream, 'dist/manifest.json'))
const manifest = JSON.parse(manifestBytes)
const bundle = readFileSync(path.join(upstream, 'dist', manifest.files.hashed))
const digest = createHash('sha256').update(bundle).digest()
if (
  manifest.localPatch ||
  manifest.upstreamSourceHash ||
  digest.toString('hex') !== manifest.hash ||
  manifest.shortHash !== manifest.hash.slice(0, 12) ||
  manifest.integrity !== `sha256-${digest.toString('base64')}`
)
  throw new Error(
    'Expected an unmodified upstream bundle with matching hashes and SRI'
  )
for (const [file, expected] of [
  ['src/geo-analytics.js', manifest.sourceHash],
  ['src/generated/event-registry.js', manifest.eventRegistryHash],
]) {
  if (
    createHash('sha256')
      .update(readFileSync(path.join(upstream, file)))
      .digest('hex') !== expected
  ) {
    throw new Error(
      `Upstream ${file} does not match the build; regenerate and rebuild upstream first`
    )
  }
}
const types = renderEventTypes(bundle.toString())
const filename = `geo-analytics-${manifest.shortHash}.js`
const loaderPath = path.join(root, 'apps/web/core/analytics.ts')
const loader = readFileSync(loaderPath, 'utf8')
if (
  !loader.includes(`geo-analytics-${oldManifest.shortHash}.js`) ||
  !loader.includes(oldManifest.integrity)
) {
  throw new Error(
    'Existing loader and manifest disagree; repair them before vendoring'
  )
}
writeFileSync(path.join(publicDir, filename), bundle)
writeFileSync(
  loaderPath,
  loader
    .replace(`geo-analytics-${oldManifest.shortHash}.js`, filename)
    .replace(oldManifest.integrity, manifest.integrity)
)
writeFileSync(path.join(root, 'apps/web/core/analytics-events.ts'), types)
// Preserve upstream manifest bytes, including its registry source hash.
writeFileSync(`${manifestPath}.tmp`, manifestBytes)
renameSync(`${manifestPath}.tmp`, manifestPath)
if (oldManifest.shortHash !== manifest.shortHash) {
  rmSync(path.join(publicDir, `geo-analytics-${oldManifest.shortHash}.js`))
}
console.log(
  `Vendored ${filename} unchanged from upstream. Run Genesis typecheck and analytics tests before release.`
)
