import type {
  PhaseStatus,
  Roadmap,
  RoadmapGroup,
  RoadmapItem,
  RoadmapPhase,
} from '../types'

const DONE_MARK = /(✅|✔️?|☑️?|\b(done|complete[d]?|shipped|released)\b)/i
const ACTIVE_MARK = /(🚧|🏗️?|⏳|🔄|\b(in[ -]progress|wip|current|ongoing|now)\b)/i
const ITEM = /^(\s*)[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/
const FENCE = /^\s*(```|~~~)/

/** Drops markdown decoration a widget row should not show. */
export function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/** A heading with its status markers ("✅", "(in progress)", "[done]") taken out. */
function cleanTitle(raw: string): string {
  return plain(raw)
    .replace(/[([](done|complete[d]?|shipped|released|in[ -]progress|wip|current|ongoing|now|planned|next|later)[)\]]/gi, '')
    .replace(/(✅|✔️?|☑️?|🚧|🏗️?|⏳|🔄|📋|🗓️?|🔜)/g, '')
    .replace(/\s+[-–—:]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function slug(text: string, index: number): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${index}-${base || 'phase'}`.slice(0, 64)
}

function statusOf(heading: string, done: number, total: number): PhaseStatus {
  if (DONE_MARK.test(heading)) return 'done'
  if (ACTIVE_MARK.test(heading)) return 'active'
  if (total > 0 && done === total) return 'done'
  if (done > 0) return 'active'
  return 'planned'
}

/** Reads a ROADMAP.md: `#` title, `##` phases, `###` groups, `- [ ]` tasks. */
export function parseRoadmap(source: string, path: string, mtimeMs: number): Roadmap {
  const lines = source.split(/\r?\n/)
  let title = ''
  let summary: string | null = null
  const drafts: Array<{ heading: string; note: string | null; groups: RoadmapGroup[] }> = []
  let isFenced = false

  const current = () => {
    if (drafts.length === 0) {
      drafts.push({ heading: 'Roadmap', note: null, groups: [] })
    }
    const phase = drafts[drafts.length - 1]!
    if (phase.groups.length === 0) phase.groups.push({ title: null, items: [] })
    return phase
  }

  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      isFenced = !isFenced
      return
    }
    if (isFenced) return

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const text = heading[2]!
      if (level === 1 && title === '') {
        title = cleanTitle(text)
      } else if (level <= 2) {
        drafts.push({ heading: text, note: null, groups: [] })
      } else {
        current().groups.push({ title: cleanTitle(text), items: [] })
      }
      return
    }

    const item = ITEM.exec(line)
    if (item) {
      const phase = current()
      const group = phase.groups[phase.groups.length - 1]!
      const mark = item[2]
      const text = plain(item[3]!)
      if (text === '') return
      const entry: RoadmapItem = {
        id: `L${index}`,
        text,
        isDone: mark === undefined ? null : mark !== ' ',
        line: index,
        depth: Math.floor(item[1]!.replace(/\t/g, '  ').length / 2),
      }
      group.items.push(entry)
      return
    }

    const prose = plain(line.replace(/^>\s?/, ''))
    if (prose === '' || /^[-=|*_]{3,}/.test(line.trim())) return
    if (drafts.length === 0) {
      if (summary === null && title !== '') summary = prose
    } else {
      const phase = drafts[drafts.length - 1]!
      const isBeforeItems = phase.groups.every(group => group.items.length === 0)
      if (phase.note === null && isBeforeItems) phase.note = prose
    }
  })

  const phases: RoadmapPhase[] = drafts
    .map((draft, index) => {
      const groups = draft.groups.filter(group => group.items.length > 0 || group.title !== null)
      const tasks = groups.flatMap(group => group.items).filter(item => item.isDone !== null)
      const done = tasks.filter(item => item.isDone === true).length
      const phaseTitle = cleanTitle(draft.heading) || `Phase ${index + 1}`

      return {
        id: slug(phaseTitle, index),
        title: phaseTitle,
        status: statusOf(draft.heading, done, tasks.length),
        note: draft.note,
        groups,
        done,
        total: tasks.length,
      }
    })
    .filter(phase => phase.groups.length > 0 || phase.note !== null)

  return {
    path,
    title: title || 'Roadmap',
    summary,
    phases,
    done: phases.reduce((sum, phase) => sum + phase.done, 0),
    total: phases.reduce((sum, phase) => sum + phase.total, 0),
    mtimeMs,
  }
}

/** The phase to put up front: the first in progress, else the first not done. */
export function focusPhase(doc: Roadmap): RoadmapPhase | undefined {
  return (
    doc.phases.find(phase => phase.status === 'active') ??
    doc.phases.find(phase => phase.status === 'planned')
  )
}

/** Flips the checkbox on `line`, if that line is still the task it was. */
export function toggleLine(source: string, item: RoadmapItem): string | null {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const line = lines[item.line]
  if (line === undefined) return null
  const match = ITEM.exec(line)
  if (!match || match[2] === undefined || plain(match[3]!) !== item.text) return null
  lines[item.line] = line.replace(/\[( |x|X)\]/, match[2] === ' ' ? '[x]' : '[ ]')

  return lines.join(eol)
}

export const TEMPLATE = `# Roadmap

What this project is heading towards, phase by phase.

## Phase 1: Foundations (in progress)

- [x] Set up the repository
- [ ] Write the first milestone

## Phase 2: Next

- [ ] Plan the next milestone

## Later

- Ideas worth keeping
`
