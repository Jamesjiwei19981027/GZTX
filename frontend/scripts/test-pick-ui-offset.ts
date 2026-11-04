import assert from 'node:assert'
import { pickUiOffset } from '../src/api/mappers'
import { calculateCanvasDefaultCenter } from '../src/components/views/peopleAxisUtils'

console.log('--- Testing pickUiOffset contract (MOBILE-SPEC section 6) ---')

// 1. 新字段优先：当 ui_offsets 和 ui_offset 同时存在时，优先使用 ui_offsets[orientation]
{
  const node = {
    ui_offsets: {
      horizontal: { x: 100, y: 120 },
      vertical: { x: 30, y: 40 },
    },
    ui_offset: { x: 999, y: 888 },
  }
  assert.deepStrictEqual(pickUiOffset(node, 'horizontal'), { x: 100, y: 120 }, '新字段优先: horizontal')
  assert.deepStrictEqual(pickUiOffset(node, 'vertical'), { x: 30, y: 40 }, '新字段优先: vertical')
}

// 嵌套在 progress_json 中的情况
{
  const node = {
    progress_json: {
      ui_offsets: {
        horizontal: { x: 50, y: 60 },
        vertical: { x: 70, y: 80 },
      },
      ui_offset: { x: 111, y: 222 },
    },
  }
  assert.deepStrictEqual(pickUiOffset(node, 'horizontal'), { x: 50, y: 60 }, 'progress_json 新字段优先: horizontal')
  assert.deepStrictEqual(pickUiOffset(node, 'vertical'), { x: 70, y: 80 }, 'progress_json 新字段优先: vertical')
}

// 2. 旧字段只算横向：只有 ui_offset 时，horizontal 得到 ui_offset，vertical 得到 {0, 0}
{
  const node = {
    ui_offset: { x: 250, y: 350 },
  }
  assert.deepStrictEqual(pickUiOffset(node, 'horizontal'), { x: 250, y: 350 }, '旧字段在 horizontal 生效')
  assert.deepStrictEqual(pickUiOffset(node, 'vertical'), { x: 0, y: 0 }, '旧字段在 vertical 回退为 0')
}

// 3. 都没有或缺省方向为零
{
  const node = {}
  assert.deepStrictEqual(pickUiOffset(node, 'horizontal'), { x: 0, y: 0 }, '无字段时为 0')
  assert.deepStrictEqual(pickUiOffset(node, 'vertical'), { x: 0, y: 0 }, '无字段时为 0')
  assert.deepStrictEqual(pickUiOffset(null, 'horizontal'), { x: 0, y: 0 }, 'null 节点为 0')
  assert.deepStrictEqual(pickUiOffset(undefined, 'vertical'), { x: 0, y: 0 }, 'undefined 节点为 0')
}

// 4. 只有 vertical 新字段，无 horizontal 新字段，且有旧字段：
{
  const node = {
    ui_offsets: {
      vertical: { x: 15, y: 25 },
    },
    ui_offset: { x: 300, y: 400 },
  }
  assert.deepStrictEqual(pickUiOffset(node, 'vertical'), { x: 15, y: 25 }, '垂直方向取 vertical')
  assert.deepStrictEqual(pickUiOffset(node, 'horizontal'), { x: 300, y: 400 }, '水平方向因缺省新字段回退到旧字段')
}

console.log('✓ pickUiOffset contract passed')

console.log('--- Testing calculateCanvasDefaultCenter (MOBILE-SPEC section 3) ---')

// 1. 优先以"我"为中心
{
  const nodes = [
    { id: '1', parentId: null, isTerminal: true, isMine: false, position: { x: 0, y: 0 } },
    { id: '2', parentId: '1', isMine: true, position: { x: 300, y: 200 } },
    { id: '3', parentId: '1', isMine: false, position: { x: 600, y: 400 } },
  ]
  const center = calculateCanvasDefaultCenter(nodes, 240, 168)
  assert.deepStrictEqual(center, { x: 300 + 120, y: 200 + 84 }, '以"我"卡片中心为默认中心')
}

// 2. 找不到"我"以根为中心
{
  const nodes = [
    { id: '1', parentId: null, isTerminal: true, isMine: false, position: { x: 50, y: 80 } },
    { id: '2', parentId: '1', isMine: false, position: { x: 350, y: 280 } },
  ]
  const center = calculateCanvasDefaultCenter(nodes, 240, 168)
  assert.deepStrictEqual(center, { x: 50 + 120, y: 80 + 84 }, '无"我"时以根为中心')
}

// 3. 空节点列表回退卡片尺寸一半
{
  assert.deepStrictEqual(calculateCanvasDefaultCenter([], 240, 168), { x: 120, y: 84 }, '空列表回退')
}

console.log('✓ calculateCanvasDefaultCenter passed')
