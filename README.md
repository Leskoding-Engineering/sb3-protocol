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
  const file: Blob = await client.call({ method: 'export' }) // current project as .sb3
})
```

### Other frameworks (e.g. Next.js)

`@schoola/sb3-protocol/node` copies the same files into any static folder. Run it before `dev`/`build`:

```js
// scripts/sync-sb3-host.mjs
import { copySb3Host } from '@schoola/sb3-protocol/node'

copySb3Host({ outDir: 'public', base: '/sb3-host/', sourceMaps: false })
```

Then point the iframe at `/sb3-host/index.html` (the page uses relative URLs) and git-ignore the copied files.

## Checks

Each check has a `label` (shown to students) and `points`. The score is the sum of points of passing checks.

| type | Passes when… | How |
| --- | --- | --- |
| `usesBlock` | Block `opcode` (or one of a list) is used at least `min` times (default 1) | static |
| `blockInside` | A block `opcode` sits inside a C-block `parent` (e.g. "if" inside "forever") | static |
| `hasSprite` | A sprite named `name` exists | static |
| `spriteCount` | There are at least `min` sprites | static |
| `costumeCount` | Sprite `sprite` has at least `min` costumes | static |
| `hasVariable` | A variable named `name` exists | static |
| `hasList` | A list named `name` exists | static |
| `customBlock` | A custom block (optionally named `name`) is defined and used | static |
| `broadcastPair` | A message (optionally `message`) is broadcast and received | static |
| `says` | A sprite (optionally `sprite`) says/thinks text containing `text` | runtime |
| `saysInOrder` | A sprite says each of `texts`, in that order | runtime |
| `touches` | Sprite `sprite` touches `other` (a sprite name, or `'_edge_'`) | runtime |
| `touchesColor` | Sprite `sprite` touches the color `color` (`#rrggbb`) | runtime |
| `moves` | Sprite `sprite` covers at least `minDistance` steps | runtime |
| `reachesPosition` | Sprite `sprite` comes within `tolerance` (default 20) of `x`, `y` | runtime |
| `changesCostume` | Sprite `sprite` switches costume | runtime |
| `switchesBackdrop` | The backdrop switches | runtime |
| `playsSound` | A sound plays (optionally from `sprite`) | runtime |
| `createsClones` | At least `min` clones of `sprite` exist at the same time | runtime |
| `drawsWithPen` | The pen goes down or stamps (optionally `sprite`) | runtime |
| `variableEquals` | Variable `name` equals `value` at the end | runtime |
| `variableChanges` | Variable `name` is set/changed at least `min` times | runtime |
| `listContains` | List `name` contains `value` at the end | runtime |

- **Static** checks only count blocks attached to a hat block (e.g. "when green flag clicked"), so loose blocks earn
  no points.
- **Runtime** checks click the green flag in the editor and record what happens until all scripts finish (and the
  input scenario is over) or `runSeconds` runs out.

### Input scenario

Interactive projects can be graded by passing `inputs` to `grade`: steps played `at` seconds after the green flag.

```ts
await client.call({
  method: 'grade',
  checks,
  runSeconds: 5,
  inputs: [
    { at: 0.5, action: 'press', key: 'right arrow', duration: 1 }, // hold a key
    { at: 2, action: 'click', sprite: 'Ball' }, // or '_stage_'
    { at: 1, action: 'answer', text: '5' }, // answers "ask and wait"
  ],
})
```

## Serving the editor (licensing)

`@schoola/sb3-host` is AGPL-3.0 and runs the AGPL-3.0 Scratch editor. When you serve it, you must offer users its
source code. The `sb3Host()` plugin generates `<base>legal.html` with the license texts and source links. Link to it
from your app, e.g. near the editor.

## License

[MIT](LICENSE)
