// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Leskoding Engineering
//
// Framework-agnostic helpers to serve the prebuilt @schoola/sb3-host page and the
// @scratch/scratch-gui assets it needs. They only locate and copy files; no editor code is imported.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Files from the scratch-gui standalone build. The bundle uses publicPath "/",
// so these must be served from the site root.
export const SCRATCH_ROOT_FILES = [
  'scratch-gui-standalone.js',
  'scratch-gui-standalone.js.LICENSE.txt',
  'extension-worker.js',
  'extension-worker.js.LICENSE.txt',
  'chunks',
  'static',
  'libraries',
]

// Block icons are loaded relative to the host page (./static/blocks-media/...),
// so they are also served under the host's base path.
export const SCRATCH_RELATIVE_DIR = 'static/blocks-media'

interface Pkg {
  name: string
  version: string
  license: string
  repository?: string | { url: string }
}

export interface Sb3HostLocation {
  hostRoot: string
  hostDist: string
  scratchRoot: string
  scratchDist: string
}

const readPkg = (dir: string): Pkg => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))

const repoUrl = (pkg: Pkg) => {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  return raw?.replace(/^git\+/, '').replace(/\.git$/, '')
}

/** Normalizes a base path to "/name/" */
export const normalizeBase = (base = '/sb3-host/') => `/${base.replace(/^\/+|\/+$/g, '')}/`

/** Finds @schoola/sb3-host and @scratch/scratch-gui as installed for the project at `root` */
export function locateSb3Host(root: string): Sb3HostLocation {
  const hostRoot = path.dirname(createRequire(path.join(root, 'package.json')).resolve('@schoola/sb3-host/package.json'))
  // scratch-gui does not export its package.json; resolve its main entry (dist/scratch-gui.js)
  const scratchDist = path.dirname(createRequire(path.join(hostRoot, 'package.json')).resolve('@scratch/scratch-gui'))
  const scratchRoot = path.dirname(scratchDist)
  const hostDist = path.join(hostRoot, 'dist')
  if (!fs.existsSync(path.join(hostDist, 'index.html'))) {
    throw new Error(`[sb3-host] ${hostDist}/index.html not found. Run "npm run build" in @schoola/sb3-host.`)
  }
  return { hostRoot, hostDist, scratchRoot, scratchDist }
}

/** URL path (relative to base) → file on disk, for the notices served next to the host page */
export function noticeFiles({ hostRoot, scratchRoot }: Sb3HostLocation): Record<string, string> {
  return {
    'LICENSE.txt': path.join(hostRoot, 'LICENSE'),
    'scratch-gui-LICENSE.txt': path.join(scratchRoot, 'LICENSE'),
    'scratch-gui-TRADEMARK.txt': path.join(scratchRoot, 'TRADEMARK'),
  }
}

/** HTML page with the license texts and source links that must be offered to users */
export function legalPage({ hostRoot, scratchRoot }: Sb3HostLocation): string {
  const host = readPkg(hostRoot)
  const scratch = readPkg(scratchRoot)
  const hostRepo = repoUrl(host)
  const row = (name: string, version: string, license: string, licenseHref: string, source?: string) =>
    `<tr><td><b>${name}</b> ${version}</td><td><a href="${licenseHref}">${license}</a></td><td>${
      source ? `<a href="${source}">${source}</a>` : '—'
    }</td></tr>`
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Editor licenses</title>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.6">
<h1>Editor licenses &amp; source code</h1>
<p>The block editor on this site is served by the components below. You can get their complete corresponding
source code from the links in this table.</p>
<table cellpadding="6" style="border-collapse:collapse" border="1">
<tr><th>Component</th><th>License</th><th>Source</th></tr>
${row(host.name, host.version, host.license, 'LICENSE.txt', hostRepo && `${hostRepo}/tree/v${host.version}`)}
${row(
  scratch.name,
  scratch.version,
  scratch.license,
  'scratch-gui-LICENSE.txt',
  `https://github.com/scratchfoundation/scratch-editor/tree/v${scratch.version}`,
)}
</table>
<p>${scratch.name} is used unmodified. Scratch is a project of the Scratch Foundation, in collaboration with the
Lifelong Kindergarten Group at the MIT Media Lab. This site is not affiliated with or endorsed by the Scratch
Foundation. See the <a href="scratch-gui-TRADEMARK.txt">trademark notice</a>.</p>
</body>`
}

export interface CopySb3HostOptions {
  /** Project root that depends on @schoola/sb3-host. Default `process.cwd()`. */
  root?: string
  /** Directory served at the site root, e.g. `dist` or Next.js `public`. */
  outDir: string
  /** URL path the host page is served from. Default `/sb3-host/`. */
  base?: string
  /** Copy `.map` files too. Default `true`. */
  sourceMaps?: boolean
}

/**
 * Copies the host page (to `<outDir><base>`) and the editor assets (to `<outDir>/`).
 * Use it from a build step for frameworks without a dev middleware hook (e.g. Next.js `public/`).
 * Returns the copied versions, handy for skipping unchanged copies.
 */
export function copySb3Host(options: CopySb3HostOptions): { host: string; scratch: string } {
  const root = options.root ?? process.cwd()
  const base = normalizeBase(options.base)
  const loc = locateSb3Host(root)
  const { hostDist, scratchDist } = loc
  const filter = options.sourceMaps === false ? (src: string) => !src.endsWith('.map') : undefined

  const hexFiles = fs.readdirSync(scratchDist).filter((f) => f.endsWith('.hex'))
  for (const name of [...SCRATCH_ROOT_FILES, ...hexFiles]) {
    fs.cpSync(path.join(scratchDist, name), path.join(options.outDir, name), { recursive: true, filter })
  }
  const target = path.join(options.outDir, base)
  fs.cpSync(hostDist, target, { recursive: true, filter })
  fs.cpSync(path.join(scratchDist, SCRATCH_RELATIVE_DIR), path.join(target, SCRATCH_RELATIVE_DIR), {
    recursive: true,
    filter,
  })
  for (const [name, src] of Object.entries(noticeFiles(loc))) {
    fs.copyFileSync(src, path.join(target, name))
  }
  fs.writeFileSync(path.join(target, 'legal.html'), legalPage(loc))
  return { host: readPkg(loc.hostRoot).version, scratch: readPkg(loc.scratchRoot).version }
}
