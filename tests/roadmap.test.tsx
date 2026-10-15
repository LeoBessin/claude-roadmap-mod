import { expect, test } from 'claude-code/testing'

import { focusPhase, parseRoadmap, toggleLine } from '../hooks/parse'

const SOURCE = `# Acme Roadmap

Where Acme goes next.

## ✅ Phase 1 — Launch

- [x] Landing page
- [x] **Sign up** flow

## Phase 2: Growth (in progress)

Grow to the first thousand users.

### Product
- [x] Invites
- [ ] Teams
  - [ ] Team billing
### Ops
- [ ] Status page

\`\`\`
- [ ] not a task, inside a fence
\`\`\`

## Later

- Mobile app
`

test('parses phases, groups, tasks and statuses', async () => {
  const doc = parseRoadmap(SOURCE, 'ROADMAP.md', 1)

  expect(doc.title).toBe('Acme Roadmap')
  expect(doc.summary).toBe('Where Acme goes next.')
  expect(doc.phases.map(phase => phase.title)).toEqual(['Phase 1 — Launch', 'Phase 2: Growth', 'Later'])
  expect(doc.phases.map(phase => phase.status)).toEqual(['done', 'active', 'planned'])
  expect(doc.done).toBe(3)
  expect(doc.total).toBe(6)

  const growth = doc.phases[1]!
  expect(growth.note).toBe('Grow to the first thousand users.')
  expect(growth.groups.map(group => group.title)).toEqual(['Product', 'Ops'])
  expect(growth.groups[0]!.items[2]!.depth).toBe(1)
  expect(doc.phases[0]!.groups[0]!.items[1]!.text).toBe('Sign up flow')
  expect(doc.phases[2]!.groups[0]!.items[0]!.isDone).toBe(null)
  expect(focusPhase(doc)?.title).toBe('Phase 2: Growth')
})

test('toggles one checkbox and refuses a stale line', async () => {
  const doc = parseRoadmap(SOURCE, 'ROADMAP.md', 1)
  const teams = doc.phases[1]!.groups[0]!.items[1]!

  const next = toggleLine(SOURCE, teams)
  expect(next).toContain('- [x] Teams')
  expect(parseRoadmap(next ?? '', 'ROADMAP.md', 2).done).toBe(4)
  expect(toggleLine(SOURCE.replace('Teams', 'Squads'), teams)).toBe(null)
})

