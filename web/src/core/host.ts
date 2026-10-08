// Bridge to the C# host (OverlayForm.cs) via WebView2 web messages.
/* eslint-disable @typescript-eslint/no-explicit-any */

const wv = () => (window as any).chrome?.webview

export const host = (m: any) => wv()?.postMessage(m)

type Handler = (m: any) => void
const handlers = new Map<string, Handler[]>()

/** Register a handler for a host message type (several modules may listen to the same type). */
export function onHost(type: string, f: Handler) {
  const a = handlers.get(type) || []
  a.push(f)
  handlers.set(type, a)
}

export function startHost() {
  wv()?.addEventListener('message', (e: any) => {
    const m = e.data
    for (const f of handlers.get(m?.type) || []) {
      try { f(m) } catch (err: any) { host({ type: 'log', msg: `JS ${m.type}: ${err?.message} ${err?.stack?.split('\n')[1] || ''}` }) }
    }
  })
  window.onerror = (msg, _src, line) => host({ type: 'log', msg: `JS: ${msg} (${line})` })
  host({ type: 'ready' })
}
