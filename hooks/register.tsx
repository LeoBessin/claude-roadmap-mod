import type { EngineInterface, Register } from 'claude-code'

import type { RoadmapFilter, RoadmapItem, RoadmapPhase } from '../types'
import { TEMPLATE, focusPhase, parseRoadmap, toggleLine } from './parse'
import { checkboxSvg, headerSvg, railSvg, statusSvg } from './svg'

const PANE = 'roadmap'
const TITLE = 'Roadmap'
const CANDIDATES = ['ROADMAP.md', 'Roadmap.md', 'roadmap.md', 'docs/ROADMAP.md', '.github/ROADMAP.md']
const POLL_MS = 1500

const DOC = { plugin: 'roadmap', key: 'doc' } as const
const PATH = { plugin: 'roadmap', key: 'path' } as const
const ERROR = { plugin: 'roadmap', key: 'error' } as const

const FILTER = { plugin: 'roadmap', key: 'filter' } as const
const COLLAPSED = { plugin: 'roadmap', key: 'collapsed' } as const

async function locate($: EngineInterface): Promise<string | null> {
  const { value: chosen = null } = await $.state.get(PATH)
  if (chosen !== null) return chosen
  for (const name of CANDIDATES) {
    if (await $.fs.exists(name).catch(() => false)) return name
  }

  return null
}

/** Re-reads the file when its mtime moved (or always, with `isForced`). */
async function refresh($: EngineInterface, isForced = false): Promise<void> {
  const file = await locate($)
  const { value: known = null } = await $.state.get(DOC)
  if (file === null) {
    if (known !== null) await $.state.set(DOC, null)
    return
  }
  try {
    const stat = await $.fs.stat(file)
    if (!isForced && known?.path === file && known.mtimeMs === stat.mtimeMs) return
    const source = await $.fs.read(file)
    await $.state.set(DOC, parseRoadmap(source, file, stat.mtimeMs))
    const { value: problem = null } = await $.state.get(ERROR)
    if (problem !== null) await $.state.set(ERROR, null)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    await $.state.set(ERROR, `Could not read ${file}: ${message}`)
  }
}

async function toggle($: EngineInterface, item: RoadmapItem): Promise<void> {
  const { value: known = null } = await $.state.get(DOC)
  if (known === null) return
  const source = await $.fs.read(known.path)
  const next = toggleLine(source, item)
  if (next === null) {
    $.ui.toast('ROADMAP.md changed underneath; reloaded it.')
  } else {
    await $.fs.write(known.path, next)
  }
  await refresh($, true)
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

// Claude Code's own theme keys, so the pane follows the person's theme.
const STATUS_COLOR = { done: 'success', active: 'claude', planned: 'inactive' } as const
const STATUS_GLYPH = { done: '●', active: '◐', planned: '○' } as const
const STATUS_LABEL = { done: 'Done', active: 'In progress', planned: 'Planned' } as const
const TRACK = 'subtle'

/** Splits `width` cells between phases by task count, never past `width` in all. */
function segmentWidths(phases: RoadmapPhase[], width: number): number[] {
  const counted = phases.filter(phase => phase.total > 0)
  const room = Math.max(counted.length, width - (counted.length - 1))
  const total = counted.reduce((sum, phase) => sum + phase.total, 0)

  return counted.map(phase => Math.max(1, Math.floor((phase.total / total) * room)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'roadmap',
      description: "Show the project's ROADMAP.md as widgets in a pane",
      argumentHint: '[path to roadmap file]',
    })
    await refresh($, true)
    $.clock.every(POLL_MS, () => void refresh($))
    if ((await $.state.get(DOC)).value != null) {
      void $.ui.open({ id: PANE, title: TITLE, columns: 56 })
    }

    return next(e)
  })

  on('command.run', { command: 'roadmap' }, async ($, e) => {
    const asked = e.args.trim()
    if (asked !== '') {
      if (!(await $.fs.exists(asked).catch(() => false))) {
        return { text: `No file at ${asked}.` }
      }
      await $.state.set(PATH, asked)
    }
    await refresh($, true)
    await $.ui.open({ id: PANE, title: TITLE, columns: 56 })
    const { value: known = null } = await $.state.get(DOC)

    return {
      text:
        known === null
          ? 'Roadmap pane opened; no ROADMAP.md found yet.'
          : `Roadmap pane opened on ${known.path}: ${known.done}/${known.total} tasks done.`,
    }
  })

  // The model editing the roadmap shows up at once, not on the next poll.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const target = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : ''
    if (/roadmap\.md$/i.test(target)) await refresh($, true)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const Markdown = 'Markdown' in table ? table.Markdown : undefined
    const columns = Math.max(20, e.props.bodyColumns - 6)

    const { value: roadmap = null } = await $.state.get(DOC)
    const { value: problem = null } = await $.state.get(ERROR)
    const { value: shown = 'all' } = await $.state.get(FILTER)
    const { value: folded = {} } = await $.state.get(COLLAPSED)

    const heading = (text: string) =>
      Markdown ? <Markdown key="heading" text={`### ${text}`} /> : <Text bold>{text}</Text>

    if (roadmap === null) {
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
          {heading('Start your roadmap')}
          <Text>
            Add a ROADMAP.md with ## phases and - [ ] tasks, and it shows up here as you work. You can also point at
            another file with /roadmap path/to/file.md.
          </Text>
          {problem === null ? null : <Text color="error">{problem}</Text>}
          <Box>
            <Button
              key="create"
              variant="primary"
              label="Create roadmap"
              onPress={async () => {
                await $.fs.write('ROADMAP.md', TEMPLATE)
                await $.state.set(PATH, null)
                await refresh($, true)
              }}
            />
          </Box>
        </Box>
      )
    }

    const focus = focusPhase(roadmap)
    const phaseIndex = focus === undefined ? roadmap.phases.length : roadmap.phases.indexOf(focus) + 1
    const isOpen = (phase: RoadmapPhase) => folded[phase.id] ?? phase.id === focus?.id

    const keep = (item: RoadmapItem) => {
      if (shown === 'all') return true
      if (item.isDone === null) return false

      return shown === 'done' ? item.isDone : !item.isDone
    }

    // Desktop: the mockup's drawing as Svg, with plain Buttons where a press lands.
    if (Svg) {
      const chip = (value: RoadmapFilter, label: string) => (
        <Button key={`filter-${value}`} plain dimColor={shown !== value} onPress={() => $.state.set(FILTER, value)}>
          <Text bold={shown === value}>{label}</Text>
        </Button>
      )

      const task = (item: RoadmapItem) =>
        item.isDone === null ? (
          <Box key={item.id} paddingLeft={item.depth * 2}>
            <Text dimColor>· {item.text}</Text>
          </Box>
        ) : (
          <Box key={item.id} gap={1} alignItems="center" paddingLeft={item.depth * 2}>
            <Svg source={checkboxSvg(item.isDone)} alt={item.isDone ? 'Done' : 'Open'} width={16} height={16} />
            <Button key={`task-${item.id}`} plain dimColor={item.isDone} onPress={() => toggle($, item)}>
              <Text strikethrough={item.isDone}>{item.text}</Text>
            </Button>
          </Box>
        )

      // Each phase is a block with its rail behind it: an absolute Box from under the
      // icon to the block's bottom, clipping one tall line, so no row height matters.
      const phaseBlock = (phase: RoadmapPhase, index: number) => {
        const isLast = index === roadmap.phases.length - 1
        const expanded = isOpen(phase)
        const groups = phase.groups
          .map(group => ({ ...group, items: group.items.filter(keep) }))
          .filter(group => group.items.length > 0)
        const flip = () => $.state.set(COLLAPSED, { ...folded, [phase.id]: !expanded })

        return (
          <Box key={`phase-${phase.id}`} flexDirection="column" position="relative" paddingBottom={1}>
            {isLast ? null : (
              <Box position="absolute" left={0} top={2} bottom={0} width={2} overflow="hidden">
                <Svg source={railSvg()} alt="Timeline" width={16} height={4000} />
              </Box>
            )}
            <Box gap={1} alignItems="center" justifyContent="space-between">
              <Box gap={1} alignItems="center" flexShrink={1}>
                <Svg source={statusSvg(phase.status)} alt={STATUS_LABEL[phase.status]} width={16} height={16} />
                <Button key={`title-${phase.id}`} plain dimColor={phase.status === 'done'} onPress={flip}>
                  <Text bold={phase.id === focus?.id}>{phase.title}</Text>
                </Button>
              </Box>
              <Box gap={1} alignItems="center">
                <Text dimColor>{phase.total === 0 ? '' : `${phase.done}/${phase.total}`}</Text>
                <Button key={`chevron-${phase.id}`} plain dimColor label={expanded ? '⌄' : '›'} onPress={flip} />
              </Box>
            </Box>
            {expanded ? (
              <Box flexDirection="column" paddingLeft={3}>
                {phase.note === null ? null : (
                  <Text dimColor italic>
                    {phase.note}
                  </Text>
                )}
                {groups.length === 0 ? (
                  <Text dimColor>{shown === 'all' ? 'Nothing listed' : `No ${shown} tasks here`}</Text>
                ) : null}
                {groups.map((group, groupIndex) => (
                  <Box key={`${phase.id}-g${groupIndex}`} flexDirection="column" marginTop={1}>
                    {group.title === null ? null : <Text dimColor>{group.title}</Text>}
                    {group.items.map(task)}
                  </Box>
                ))}
              </Box>
            ) : null}
          </Box>
        )
      }

      return (
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Svg
            source={headerSvg(roadmap)}
            alt={`${roadmap.title}: ${roadmap.done} of ${roadmap.total} tasks done, ${percent(roadmap.done, roadmap.total)}%`}
          />
          <Box justifyContent="space-between" marginY={1}>
            <Box gap={1}>
              {chip('all', 'All')}
              {chip('open', 'Open')}
              {chip('done', 'Done')}
            </Box>
            <Button key="reload" plain dimColor label="↻" onPress={() => refresh($, true)} />
          </Box>
          {problem === null ? null : <Text color="error">{problem}</Text>}
          <Box flexDirection="column">{roadmap.phases.map(phaseBlock)}</Box>
          <Text dimColor wrap="truncate-start">
            {roadmap.path}
          </Text>
        </Box>
      )
    }

    const bar = () => {
      const tasked = roadmap.phases.filter(phase => phase.total > 0)
      const widths = segmentWidths(roadmap.phases, columns)

      return (
        <Text wrap="truncate-end">
          {tasked.map((phase, index) => {
            const width = widths[index] ?? 1
            const filled = Math.round((phase.done / phase.total) * width)

            return (
              <Text key={`seg-${phase.id}`}>
                <Text color={phase.status === 'done' ? 'success' : 'claude'}>{'━'.repeat(filled)}</Text>
                <Text color={TRACK}>{'━'.repeat(width - filled)}</Text>
                {index < tasked.length - 1 ? ' ' : ''}
              </Text>
            )
          })}
        </Text>
      )
    }

    const stat = (key: string, value: string, label: string, color?: string) => (
      <Box key={key} flexDirection="column" flexGrow={1} borderStyle="round" borderColor={TRACK} paddingX={1}>
        <Text bold color={color}>
          {value}
        </Text>
        <Text dimColor>{label}</Text>
      </Box>
    )

    const chip = (value: RoadmapFilter, label: string) => (
      <Button key={`filter-${value}`} plain dimColor={shown !== value} onPress={() => $.state.set(FILTER, value)}>
        <Text bold={shown === value} color={shown === value ? 'claude' : undefined} underline={shown === value}>
          {label}
        </Text>
      </Button>
    )

    const taskRow = (item: RoadmapItem) => {
      const indent = '  '.repeat(item.depth)
      if (item.isDone === null) {
        return (
          <Text key={item.id} dimColor>
            {indent}· {item.text}
          </Text>
        )
      }

      return (
        <Button key={item.id} plain onPress={() => toggle($, item)}>
          {indent}
          <Text color={item.isDone ? 'success' : 'inactive'}>{item.isDone ? '☑' : '☐'}</Text>{' '}
          <Text dimColor={item.isDone} strikethrough={item.isDone}>
            {item.text}
          </Text>
        </Button>
      )
    }

    const phaseBlock = (phase: RoadmapPhase) => {
      const expanded = isOpen(phase)
      const groups = phase.groups
        .map(group => ({ ...group, items: group.items.filter(keep) }))
        .filter(group => group.items.length > 0)

      return (
        <Box key={`phase-${phase.id}`} flexDirection="column" marginBottom={1}>
          <Button
            key={`toggle-${phase.id}`}
            plain
            onPress={() => $.state.set(COLLAPSED, { ...folded, [phase.id]: !expanded })}
          >
            <Text color={STATUS_COLOR[phase.status]}>{STATUS_GLYPH[phase.status]}</Text>{' '}
            <Text bold>{phase.title}</Text> <Text dimColor>{expanded ? '▾' : '▸'}</Text>
          </Button>
          <Box paddingLeft={2}>
            <Text color={STATUS_COLOR[phase.status]}>{STATUS_LABEL[phase.status]}</Text>
            <Text dimColor>
              {phase.total === 0
                ? ' · ideas'
                : ` · ${phase.done} of ${phase.total} · ${percent(phase.done, phase.total)}%`}
            </Text>
          </Box>
          {expanded ? (
            <Box flexDirection="column" paddingLeft={2} marginTop={1}>
              {phase.note === null ? null : (
                <Text dimColor italic>
                  {phase.note}
                </Text>
              )}
              {groups.length === 0 ? (
                <Text dimColor>{shown === 'all' ? 'Nothing listed' : `No ${shown} tasks here`}</Text>
              ) : null}
              {groups.map((group, index) => (
                <Box key={`${phase.id}-g${index}`} flexDirection="column" marginTop={1}>
                  {group.title === null ? null : <Text bold>{group.title}</Text>}
                  {group.items.map(taskRow)}
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        {heading(roadmap.title)}
        {roadmap.summary === null ? null : <Text dimColor>{roadmap.summary}</Text>}

        <Box marginTop={1} gap={1}>
          {stat('pct', `${percent(roadmap.done, roadmap.total)}%`, 'complete', roadmap.done === roadmap.total ? 'success' : 'claude')}
          {stat('tasks', `${roadmap.done}/${roadmap.total}`, 'tasks done')}
          {stat('phase', `${phaseIndex}/${roadmap.phases.length}`, 'current phase')}
        </Box>

        <Box marginTop={1}>{bar()}</Box>

        <Box justifyContent="space-between" marginY={1}>
          <Box gap={2}>
            {chip('all', 'All')}
            {chip('open', 'Open')}
            {chip('done', 'Done')}
          </Box>
          <Button key="reload" plain dimColor onPress={() => refresh($, true)}>
            ↻ Reload
          </Button>
        </Box>

        {problem === null ? null : <Text color="error">{problem}</Text>}
        {roadmap.phases.map(phaseBlock)}

        <Text dimColor wrap="truncate-start">
          {roadmap.path}
        </Text>
      </Box>
    )
  })
}
