import type { PhaseStatus, Roadmap } from '../types'

// Claude Code's theme colors. An Svg cannot name a theme key, so each color
// carries a light and a dark value, picked by the system's color scheme.
const STYLE = `<style>
.p{fill:#1F1F1E}.s{fill:#6B6A66}.m{fill:#8E8D88}.k{fill:#E3E2DD}
.f-ok{fill:#2C7A39}.f-go{fill:#D77757}.f-no{fill:#8E8D88}
.l-ok{stroke:#2C7A39}.l-go{stroke:#D77757}.l-no{stroke:#8E8D88}.l-rail{stroke:#C9C7C0}
@media (prefers-color-scheme:dark){.p{fill:#ECEBE6}.s{fill:#A3A29C}.m{fill:#7A7974}.k{fill:#3A3936}
.f-ok{fill:#4EBA65}.l-ok{stroke:#4EBA65}.l-rail{stroke:#5E5D58}.f-no{fill:#7A7974}.l-no{stroke:#7A7974}}
</style>`
const FONT = `font-family="system-ui,-apple-system,'Segoe UI',sans-serif"`

const STATUS_CLASS = { done: 'ok', active: 'go', planned: 'no' } as const

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Text width in px, roughly, for laying out a row inside the drawing. */
function measure(text: string, size: number): number {
  return text.length * size * 0.5
}

/** The header: title, count, one segmented bar, and the status legend. */
export function headerSvg(doc: Roadmap, width = 400): string {
  const pct = doc.total === 0 ? 0 : Math.round((doc.done / doc.total) * 100)
  const tasked = doc.phases.filter(phase => phase.total > 0)
  const gap = 3
  const room = width - gap * Math.max(0, tasked.length - 1)
  let x = 0
  const bar = tasked
    .map(phase => {
      const w = (phase.total / doc.total) * room
      const filled = (phase.done / phase.total) * w
      const fillClass = phase.status === 'done' ? 'ok' : 'go'
      const out =
        `<rect class="k" x="${x.toFixed(1)}" y="30" width="${w.toFixed(1)}" height="6" rx="3" fill="#8E8D8840"/>` +
        (filled > 0
          ? `<rect class="f-${fillClass}" x="${x.toFixed(1)}" y="30" width="${Math.max(filled, 6).toFixed(1)}" height="6" rx="3" fill="#D77757"/>`
          : '')
      x += w + gap

      return out
    })
    .join('')

  const counts: Array<[PhaseStatus, string]> = [
    ['done', 'Done'],
    ['active', 'In progress'],
    ['planned', 'Planned'],
  ]
  let lx = 0
  const legend = counts
    .map(([status, label]) => {
      const text = `${label} ${doc.phases.filter(phase => phase.status === status).length}`
      const out =
        `<circle class="f-${STATUS_CLASS[status]}" cx="${lx + 4}" cy="54" r="3.5" fill="#8E8D88"/>` +
        `<text class="m" x="${lx + 12}" y="58" font-size="11" fill="#8E8D88">${esc(text)}</text>`
      lx += 12 + measure(text, 11) + 14

      return out
    })
    .join('')

  const right = `${doc.done} of ${doc.total} · ${pct}%`
  const titleRoom = Math.floor((width - measure(right, 13) - 16) / (15 * 0.56))
  const title = doc.title.length > titleRoom ? `${doc.title.slice(0, Math.max(1, titleRoom - 1))}…` : doc.title

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64" viewBox="0 0 ${width} 64" ${FONT}>${STYLE}` +
    `<text class="p" x="0" y="17" font-size="15" font-weight="500" fill="#8E8D88">${esc(title)}</text>` +
    `<text class="s" x="${width}" y="17" font-size="13" text-anchor="end" fill="#8E8D88">${esc(right)}</text>` +
    bar +
    legend +
    `</svg>`
  )
}

/** A phase's status icon, as the mockup draws it: check, half-filled, dashed. */
export function statusSvg(status: PhaseStatus): string {
  const c = STATUS_CLASS[status]
  const ring = `<circle class="l-${c}" cx="8" cy="8" r="6.25" fill="none" stroke="#8E8D88" stroke-width="1.5"${status === 'planned' ? ' stroke-dasharray="2.4 2.2"' : ''}/>`
  const mark =
    status === 'done'
      ? `<path class="l-${c}" d="M5.4 8.2l1.8 1.8 3.4-3.6" fill="none" stroke="#8E8D88" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : status === 'active'
        ? `<path class="f-${c}" d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="#D77757"/>`
        : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${STYLE}${ring}${mark}</svg>`
}

/** A task's checkbox: a rounded square, ticked in green once done. */
export function checkboxSvg(isDone: boolean): string {
  const body = isDone
    ? `<rect class="l-ok" x="1.75" y="1.75" width="12.5" height="12.5" rx="3" fill="none" stroke="#4EBA65" stroke-width="1.5"/><path class="l-ok" d="M5 8.1l2 2 4-4.2" fill="none" stroke="#4EBA65" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<rect class="l-no" x="1.75" y="1.75" width="12.5" height="12.5" rx="3" fill="none" stroke="#8E8D88" stroke-width="1.5"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${STYLE}${body}</svg>`
}

/** A tall rail line; the Box it sits in clips it to the phase's height. */
export function railSvg(height = 4000): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="${height}" viewBox="0 0 16 ${height}">${STYLE}<line class="l-rail" x1="8" y1="0" x2="8" y2="${height}" stroke="#8E8D88" stroke-width="1.5"/></svg>`
}
