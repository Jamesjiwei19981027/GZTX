import type { Status } from '../../types'

type ProgressItem = {
  progress?: number
  status: Status
}

type ProgressNode = {
  workItems: ProgressItem[]
}

/** Return the real average progress for a people-axis tree. */
export function averagePeopleAxisProgress(nodes: ProgressNode[]): number {
  let total = 0
  let count = 0
  for (const node of nodes) {
    for (const item of node.workItems) {
      total += item.progress ?? (item.status === 'Done' ? 100 : item.status === 'In Progress' ? 50 : 0)
      count += 1
    }
  }
  return count > 0 ? Math.round(total / count) : 0
}
