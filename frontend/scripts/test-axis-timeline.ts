import assert from 'node:assert/strict'
import * as utils from '../src/components/views/peopleAxisUtils'
import type { PeopleAxisNode } from '../src/types'

assert.equal(typeof utils.buildAxisTimeline, 'function', '人轴应提供可测试的日期刻度和事项定位函数')
const make = (id: string, dates: string[], parentId?: string, orderOnAxis = 0) => ({
  id, parentId, orderOnAxis, person: { id, name: id, avatar: '', role: '' }, roleTitle: '',
  workItems: dates.map((dueDate, i) => ({ id: `${id}-${i}`, title: `${id}-${i}`, dueDate, status: 'In Progress', progress: 0, type: 'task', evidences: [] })),
}) as PeopleAxisNode
const nodes = [make('a', ['2026-01-01', '2026-01-01', '2026-01-03']), make('b', ['2026-01-02', '', '2026-02-31'])]
const timeline = utils.buildAxisTimeline(nodes)
assert.equal(timeline.items.length, 4, '空日期和无效日期不定位')
const first = timeline.items.find(x => x.item.id === 'a-0')!
const sameDay = timeline.items.find(x => x.item.id === 'a-1')!
const middle = timeline.items.find(x => x.item.id === 'b-0')!
const last = timeline.items.find(x => x.item.id === 'a-2')!
assert.equal(middle.along - first.along, last.along - middle.along, '相同日期间隔对应相同轴向距离')
assert.equal(first.along, sameDay.along, '同一天锚点相同')
assert.notEqual(first.lane, sameDay.lane, '同日事项分道避免卡片重叠')
assert.ok(timeline.ticks.length >= 2 && timeline.end > timeline.start, '主干有连续范围与可读刻度')
assert.equal(utils.buildAxisTimeline([]).items.length, 0, '空树正常返回')
assert.equal(utils.buildAxisTimeline([make('empty', [''])]).ticks.length, 0, '无日期不编造刻度')
const original = [make('late', ['2026-02-01'], 'root', 0), make('early', ['2026-01-01'], 'root', 1), make('empty', [], 'root', 2)]
const ordered = utils.applyTimeOrder(original)
assert.equal(ordered.find(x => x.id === 'early')!.orderOnAxis, 0, '时间序按未完成事项最早日期排序')
assert.equal(ordered.find(x => x.id === 'empty')!.orderOnAxis, 2, '未设日期在最后')
assert.deepEqual(original.map(x => x.orderOnAxis), [0, 1, 2], '排序不修改原树')
assert.deepEqual(ordered.map(x => x.parentId), original.map(x => x.parentId), '排序保留上下级')
console.log('axis timeline: 12 assertions passed')
