// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Leskoding Engineering
//
// postMessage protocol between a parent page and the @schoola/sb3-host iframe.
// Only plain JSON-shaped data crosses the boundary; this package contains no editor code.

/** A grading rule. `points` are awarded when the rule passes. */
export type Check = { label: string; points: number } & (
  // Static: inspected from the project. Only blocks attached to a hat block (event) count.
  | { type: 'usesBlock'; opcode: string | string[]; min?: number }
  /** A block (any of `opcode`) placed inside a C-block / container (any of `parent`), e.g. "if" inside "forever" */
  | { type: 'blockInside'; opcode: string | string[]; parent: string | string[] }
  | { type: 'hasSprite'; name: string }
  | { type: 'spriteCount'; min: number }
  | { type: 'costumeCount'; sprite: string; min: number }
  | { type: 'hasVariable'; name: string }
  | { type: 'hasList'; name: string }
  /** A custom block ("My Blocks") is defined and used; optionally with a name */
  | { type: 'customBlock'; name?: string }
  /** A message is broadcast and received by a script; optionally a specific message */
  | { type: 'broadcastPair'; message?: string }
  // Runtime: observed while the project runs (green flag, then the optional input scenario).
  | { type: 'says'; text: string; sprite?: string }
  | { type: 'saysInOrder'; texts: string[]; sprite?: string }
  | { type: 'touches'; sprite: string; other: string } // other: sprite name or '_edge_'
  | { type: 'touchesColor'; sprite: string; color: string } // color: '#rrggbb'
  | { type: 'moves'; sprite: string; minDistance: number }
  | { type: 'reachesPosition'; sprite: string; x: number; y: number; tolerance?: number }
  | { type: 'changesCostume'; sprite: string }
  | { type: 'switchesBackdrop' }
  | { type: 'playsSound'; sprite?: string }
  | { type: 'createsClones'; sprite: string; min: number }
  | { type: 'drawsWithPen'; sprite?: string }
  | { type: 'variableEquals'; name: string; value: number | string }
  | { type: 'variableChanges'; name: string; min?: number }
  | { type: 'listContains'; name: string; value: number | string }
)

/** Keys an input scenario can press */
export type InputKey =
  | 'space' | 'enter' | 'left arrow' | 'right arrow' | 'up arrow' | 'down arrow'
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/**
 * One step of the input scenario played while grading, `at` seconds after the green flag:
 * hold a key, click a sprite (or '_stage_'), or answer the pending "ask and wait".
 */
export type InputStep = { at: number } & (
  | { action: 'press'; key: InputKey; duration?: number }
  | { action: 'click'; sprite: string }
  | { action: 'answer'; text: string }
)

export interface CheckResult {
  label: string
  points: number
  earned: number
  passed: boolean
}

export interface GradeResult {
  score: number
  total: number
  checks: CheckResult[]
}

/** Requests from the parent page to the host. */
export type HostRequest =
  | { method: 'open'; projectId: string; starterUrl?: string }
  | { method: 'reset' }
  | { method: 'loadFile'; file: Blob }
  | { method: 'download'; filename: string }
  /** Current project as an .sb3 file, e.g. to upload it */
  | { method: 'export' }
  | { method: 'grade'; checks: Check[]; runSeconds: number; inputs?: InputStep[] }

export type HostResult<M extends HostRequest['method']> = M extends 'grade'
  ? GradeResult
  : M extends 'export'
    ? Blob
    : null

export const READY = 'sb3-host:ready'
export const REQUEST = 'sb3-host:request'
export const RESPONSE = 'sb3-host:response'

/** Messages from the host to the parent page. */
export type HostMessage =
  | { type: typeof READY }
  | { type: typeof RESPONSE; requestId: number; ok: true; result: unknown }
  | { type: typeof RESPONSE; requestId: number; ok: false; error: string }

/** Envelope for a request sent from the parent page. */
export type HostEnvelope = { type: typeof REQUEST; requestId: number; request: HostRequest }

/**
 * Talks to an sb3-host iframe served from the same origin as the parent page.
 *
 * ```ts
 * const client = new Sb3HostClient(iframe)
 * client.onReady(async () => {
 *   await client.call({ method: 'open', projectId: 'lesson-1' })
 *   const result = await client.call({ method: 'grade', checks, runSeconds: 5 })
 * })
 * ```
 */
export class Sb3HostClient {
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readyListeners = new Set<() => void>()
  ready = false

  constructor(private frame: HTMLIFrameElement) {
    window.addEventListener('message', this.onMessage)
  }

  dispose() {
    window.removeEventListener('message', this.onMessage)
    for (const p of this.pending.values()) p.reject(new Error('sb3-host closed'))
    this.pending.clear()
  }

  onReady(fn: () => void) {
    if (this.ready) fn()
    else this.readyListeners.add(fn)
  }

  call<R extends HostRequest>(request: R): Promise<HostResult<R['method']>> {
    const requestId = this.nextId++
    const envelope: HostEnvelope = { type: REQUEST, requestId, request }
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject })
      this.frame.contentWindow?.postMessage(envelope, location.origin)
    })
  }

  private onMessage = (e: MessageEvent<HostMessage>) => {
    if (e.origin !== location.origin || e.source !== this.frame.contentWindow) return
    const msg = e.data
    if (msg?.type === READY) {
      this.ready = true
      for (const fn of this.readyListeners) fn()
      this.readyListeners.clear()
    } else if (msg?.type === RESPONSE) {
      const p = this.pending.get(msg.requestId)
      if (!p) return
      this.pending.delete(msg.requestId)
      if (msg.ok) p.resolve(msg.result)
      else p.reject(new Error(msg.error))
    }
  }
}
