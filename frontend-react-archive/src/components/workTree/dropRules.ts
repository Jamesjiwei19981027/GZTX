import { isMatter, isPerson } from './layout'

/** 空白处只收人；事项必须落到人；人落到人 = 下级人员 */
export function canDropPalette(
  typeKey: string,
  ontoNodeType: string | null,
): boolean {
  if (ontoNodeType == null) return typeKey === 'person'
  if (ontoNodeType === 'person') return true
  return false
}

export function canMoveNode(
  dragType: string,
  ontoNodeType: string,
): boolean {
  if (ontoNodeType !== 'person') return false
  return isPerson({ node_type_key: dragType } as never) || isMatter({ node_type_key: dragType } as never)
}

export const PALETTE = [
  { nodeTypeKey: 'person', label: '人', defaultTitle: '未命名' },
  { nodeTypeKey: 'work_item', label: '工作项', defaultTitle: '新工作项' },
  { nodeTypeKey: 'milestone', label: '里程碑', defaultTitle: '新里程碑' },
  { nodeTypeKey: 'scope', label: '范围', defaultTitle: '新范围' },
] as const
