import { describe, expect, it } from 'vitest'
import { computeLayout, flattenPersons, hasLeaderOnSpine } from './layout'
import type { TreeNodeDTO } from '@/types/collab'

function person(
  id: number,
  title: string,
  assigneeId?: number,
  children: TreeNodeDTO[] = [],
): TreeNodeDTO {
  return {
    id,
    parent_id: null,
    node_type_key: 'person',
    behavior_template: 'person',
    title,
    description: null,
    sort_order: 0,
    path: `/${id}`,
    depth: 0,
    progress_json: { template: 'work_item' },
    assignees: assigneeId
      ? [{ user_id: assigneeId, role_key: 'primary', display_name: `U${assigneeId}` }]
      : [],
    children,
  }
}

describe('workTree layout', () => {
  it('pins leader to axis terminus', () => {
    const roots = [
      person(1, 'A', 10),
      person(2, 'Leader', 99),
      person(3, 'B', 11),
    ]
    expect(hasLeaderOnSpine(roots, 99)).toBe(true)
    const flat = flattenPersons(roots, 'tree', 99)
    expect(flat[flat.length - 1].node.id).toBe(2)
    const layout = computeLayout({
      roots,
      axis: 'horizontal',
      sort: 'tree',
      finalOwnerUserId: 99,
    })
    const leader = layout.placed.find((p) => p.isOrigin)
    expect(leader?.node.id).toBe(2)
    expect(leader?.side).toBe(0)
    expect(layout.axisEnd.x).toBe(leader!.center.x)
  })
})
