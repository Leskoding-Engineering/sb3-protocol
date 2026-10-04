# @schoola/sb3-protocol

Typed `postMessage` protocol and client for talking to the
[`@schoola/sb3-host`](https://github.com/Leskoding-Engineering/sb3-host) iframe from a parent page: open, reset, load,
download and grade `.sb3` projects.

This package contains **no editor code** and is MIT-licensed, so your app can use any license.

- `@schoola/sb3-protocol`: message types, check types and `Sb3HostClient`
- `@schoola/sb3-protocol/vite`: `sb3Host()` Vite plugin that serves (dev) and copies (build) the prebuilt
  `@schoola/sb3-host` page and the editor assets it needs. It only copies files.

## Usage

```bash
npm install @schoola/sb3-protocol @schoola/sb3-host
```

```ts
// vite.config.ts
import { sb3Host } from '@schoola/sb3-protocol/vite'

export default defineConfig({ plugins: [sb3Host({ base: '/sb3-host/' })] })
```

```ts
import { Sb3HostClient, type Check } from '@schoola/sb3-protocol'

const client = new Sb3HostClient(iframe) // <iframe src="/sb3-host/">
client.onReady(async () => {
  await client.call({ method: 'open', projectId: 'lesson-1' })
  const { score, total, checks } = await client.call({ method: 'grade', checks: rubric, runSeconds: 5 })
})
```

## Checks

Each check has a `label` (shown to students) and `points`. The score is the sum of points of passing checks.

| type | Passes when… | How |
| --- | --- | --- |
| `usesBlock` | Block `opcode` (or one of a list) is used at least `min` times (default 1) | static |
| `hasSprite` | A sprite named `name` exists | static |
| `spriteCount` | There are at least `min` sprites | static |
| `hasVariable` | A variable named `name` exists | static |
| `says` | A sprite (optionally `sprite`) says/thinks text containing `text` | runtime |
| `touches` | Sprite `sprite` touches `other` (a sprite name, or `'_edge_'`) | runtime |
| `moves` | Sprite `sprite` covers at least `minDistance` steps | runtime |
| `variableEquals` | Variable `name` equals `value` at the end | runtime |

- **Static** checks only count blocks attached to a hat block (e.g. "when green flag clicked"), so loose blocks earn
  no points.
- **Runtime** checks click the green flag in the editor and record what happens until all scripts finish or
  `runSeconds` runs out.

## Serving the editor (licensing)

`@schoola/sb3-host` is AGPL-3.0 and runs the AGPL-3.0 Scratch editor. When you serve it, you must offer users its
source code. The `sb3Host()` plugin generates `<base>legal.html` with the license texts and source links. Link to it
from your app, e.g. near the editor.

## License

[MIT](LICENSE)
