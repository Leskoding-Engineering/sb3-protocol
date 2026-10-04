// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Leskoding Engineering
//
// Vite plugin that serves (dev) and copies (build) the prebuilt @schoola/sb3-host page and the
// @scratch/scratch-gui assets it needs. It only copies files; it does not import editor code.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

export interface Sb3HostPluginOptions {
  /** URL path the host page is served from. Default `/sb3-host/`. */
  base?: string
}

// Files from the scratch-gui standalone build. The bundle uses publicPath "/",
// so these must be served from the site root.
const SCRATCH_ROOT_FILES = [
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
const SCRATCH_RELATIVE_DIR = 'static/blocks-media'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

interface Pkg {
  name: string
  version: string
  license: string
  repository?: string | { url: string }
}

const readPkg = (dir: string): Pkg => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))

const repoUrl = (pkg: Pkg) => {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  return raw?.replace(/^git\+/, '').replace(/\.git$/, '')
}

function locate(root: string) {
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

function legalPage(hostRoot: string, scratchRoot: string) {
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

export function sb3Host(options: Sb3HostPluginOptions = {}): Plugin {
  const base = `/${(options.base ?? '/sb3-host/').replace(/^\/+|\/+$/g, '')}/`
  let root = process.cwd()
  let outDir = 'dist'

  // URL path (relative to base) → file on disk, for the notices served next to the host page
  const notices = (hostRoot: string, scratchRoot: string): Record<string, string> => ({
    'LICENSE.txt': path.join(hostRoot, 'LICENSE'),
    'scratch-gui-LICENSE.txt': path.join(scratchRoot, 'LICENSE'),
    'scratch-gui-TRADEMARK.txt': path.join(scratchRoot, 'TRADEMARK'),
  })

  return {
    name: 'sb3-host',
    configResolved(config) {
      root = config.root
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      const { hostRoot, hostDist, scratchRoot, scratchDist } = locate(root)
      const extraFiles = notices(hostRoot, scratchRoot)

      const send = (res: import('node:http').ServerResponse, file: string) => {
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      }
      const isFile = (f: string) => fs.existsSync(f) && fs.statSync(f).isFile()

      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0])

        if (url === base.slice(0, -1)) {
          res.statusCode = 302
          res.setHeader('Location', base)
          return res.end()
        }
        if (url.startsWith(base)) {
          const rel = url.slice(base.length) || 'index.html'
          if (rel === 'legal.html') {
            res.setHeader('Content-Type', MIME['.html'])
            return res.end(legalPage(hostRoot, scratchRoot))
          }
          if (extraFiles[rel]) return send(res, extraFiles[rel])
          const dir = rel.startsWith(`${SCRATCH_RELATIVE_DIR}/`) ? scratchDist : hostDist
          const file = path.join(dir, rel)
          if (file.startsWith(dir) && isFile(file)) return send(res, file)
          return next()
        }

        const top = url.split('/')[1] ?? ''
        if (SCRATCH_ROOT_FILES.includes(top) || /^[0-9a-f]{32}\.hex$/.test(top)) {
          const file = path.join(scratchDist, url)
          if (file.startsWith(scratchDist) && isFile(file)) return send(res, file)
        }
        next()
      })
    },
    closeBundle() {
      const { hostRoot, hostDist, scratchRoot, scratchDist } = locate(root)
      const hexFiles = fs.readdirSync(scratchDist).filter((f) => f.endsWith('.hex'))
      for (const name of [...SCRATCH_ROOT_FILES, ...hexFiles]) {
        fs.cpSync(path.join(scratchDist, name), path.join(outDir, name), { recursive: true })
      }
      const target = path.join(outDir, base)
      fs.cpSync(hostDist, target, { recursive: true })
      fs.cpSync(path.join(scratchDist, SCRATCH_RELATIVE_DIR), path.join(target, SCRATCH_RELATIVE_DIR), {
        recursive: true,
      })
      for (const [name, src] of Object.entries(notices(hostRoot, scratchRoot))) {
        fs.copyFileSync(src, path.join(target, name))
      }
      fs.writeFileSync(path.join(target, 'legal.html'), legalPage(hostRoot, scratchRoot))
    },
  }
}
