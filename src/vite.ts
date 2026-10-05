// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Leskoding Engineering
//
// Vite plugin that serves (dev) and copies (build) the prebuilt @schoola/sb3-host page and the
// @scratch/scratch-gui assets it needs. It only copies files; it does not import editor code.
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import {
  SCRATCH_RELATIVE_DIR,
  SCRATCH_ROOT_FILES,
  copySb3Host,
  legalPage,
  locateSb3Host,
  normalizeBase,
  noticeFiles,
} from './node.js'

export interface Sb3HostPluginOptions {
  /** URL path the host page is served from. Default `/sb3-host/`. */
  base?: string
}

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

export function sb3Host(options: Sb3HostPluginOptions = {}): Plugin {
  const base = normalizeBase(options.base)
  let root = process.cwd()
  let outDir = 'dist'

  return {
    name: 'sb3-host',
    configResolved(config) {
      root = config.root
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      const loc = locateSb3Host(root)
      const { hostDist, scratchDist } = loc
      const extraFiles = noticeFiles(loc)

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
            return res.end(legalPage(loc))
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
      copySb3Host({ root, outDir, base })
    },
  }
}
