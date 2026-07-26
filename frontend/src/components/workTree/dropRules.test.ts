import { describe, expect, it } from 'vitest'
import { PALETTE, canDropPalette, canMoveNode } from './dropRules'

/**
 * 人轴拖放规则。产品已锁定：
 * - 空白处只收人
 * - 事项（工作项/里程碑/范围）只能落到人身上
 * - 人落到人 = 下级人员
 *
 * 这些规则此前零单测，且后端也不校验；现在后端有 TreeService.assert_shape 兜底，
 * 前端这层负责的是"不让用户做出会被后端拒绝的动作"。
 */
describe('canDropPalette（从调色板拖出）', () => {
  it('空白处只收人', () => {
    expect(canDropPalette('person', null)).toBe(true)
    expect(canDropPalette('work_item', null)).toBe(false)
    expect(canDropPalette('milestone', null)).toBe(false)
    expect(canDropPalette('scope', null)).toBe(false)
  })

  it('人身上什么都能挂（事项 + 下级）', () => {
    for (const item of PALETTE) {
      expect(canDropPalette(item.nodeTypeKey, 'person')).toBe(true)
    }
  })

  it('事项上什么都不能挂', () => {
    for (const onto of ['work_item', 'milestone', 'scope']) {
      for (const item of PALETTE) {
        expect(canDropPalette(item.nodeTypeKey, onto)).toBe(false)
      }
    }
  })
})

describe('canMoveNode（拖动已有节点）', () => {
  it('只能落到人身上', () => {
    expect(canMoveNode('work_item', 'person')).toBe(true)
    expect(canMoveNode('person', 'person')).toBe(true)
    expect(canMoveNode('milestone', 'person')).toBe(true)
    expect(canMoveNode('scope', 'person')).toBe(true)
  })

  it('落到事项上一律拒绝', () => {
    for (const onto of ['work_item', 'milestone', 'scope']) {
      for (const drag of ['person', 'work_item', 'milestone', 'scope']) {
        expect(canMoveNode(drag, onto)).toBe(false)
      }
    }
  })
})

describe('PALETTE', () => {
  it('恰好是产品定义的四类', () => {
    expect(PALETTE.map((p) => p.nodeTypeKey)).toEqual([
      'person',
      'work_item',
      'milestone',
      'scope',
    ])
  })
})
