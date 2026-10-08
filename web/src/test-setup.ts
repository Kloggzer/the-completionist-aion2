// Minimal browser globals for unit tests of the logic modules (no DOM needed).
const g = globalThis as Record<string, unknown>
g.window ??= globalThis
g.requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0)
