export type RoadmapItem = {
  id: string
  text: string
  /** `true`/`false` for a `- [x]`/`- [ ]` task, `null` for a plain bullet. */
  isDone: boolean | null
  /** Zero-based line in the file, so a toggle rewrites the right one. */
  line: number
  depth: number
}

export type RoadmapGroup = { title: string | null; items: RoadmapItem[] }

export type PhaseStatus = 'done' | 'active' | 'planned'

export type RoadmapPhase = {
  id: string
  title: string
  status: PhaseStatus
  note: string | null
  groups: RoadmapGroup[]
  done: number
  total: number
}

export type Roadmap = {
  path: string
  title: string
  summary: string | null
  phases: RoadmapPhase[]
  done: number
  total: number
  mtimeMs: number
}

export type RoadmapFilter = 'all' | 'open' | 'done'

declare module 'claude-code' {
  interface PluginState {
    roadmap: {
      doc: Roadmap | null
      path: string | null
      error: string | null
      filter: RoadmapFilter
      collapsed: Record<string, boolean>
    }
  }
}
