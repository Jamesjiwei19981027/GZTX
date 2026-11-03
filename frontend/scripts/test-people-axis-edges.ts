import assert from 'node:assert/strict'
import { borderAnchor, floatingEdgePath, straightEdgePath, subordinatePortAnchor, highlightEdgeIds, snapToParentAxis, type RectCoords } from '../src/components/views/peopleAxisUtils'

function rect(centerX: number, centerY: number, width = 200, height = 100): RectCoords {
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
    width,
    height,
    centerX,
    centerY,
  }
}

// 1. Target straight to the right: anchor sits on right border midpoint.
{
  const a = borderAnchor(rect(0, 0), 500, 0)
  assert.equal(a.side, 'right')
  assert.equal(a.x, 100)
  assert.equal(a.y, 0)
}

// 2. Target straight below: anchor sits on bottom border midpoint.
{
  const a = borderAnchor(rect(0, 0), 0, 400)
  assert.equal(a.side, 'bottom')
  assert.equal(a.x, 0)
  assert.equal(a.y, 50)
}

// 3. Diagonal target: anchor slides along the border (not stuck at midpoints)
// and always stays exactly on the rectangle outline.
{
  const a = borderAnchor(rect(0, 0), 300, 120)
  assert.equal(a.side, 'right')
  assert.equal(a.x, 100)
  assert.equal(a.y, 40) // 120 * (100 / 300): slid down the right border
}

// 4. Continuity across the corner: just before/after the diagonal where the
// binding side flips, both anchors converge to the same corner point.
{
  const r = rect(0, 0)
  const before = borderAnchor(r, 200, 99.99)
  const after = borderAnchor(r, 200, 100.01)
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 0.5)
}

// 5. Moving the target moves the anchor: edges follow dragged nodes.
{
  const r = rect(0, 0)
  const a1 = borderAnchor(r, 400, -80)
  const a2 = borderAnchor(r, 400, 80)
  assert.notEqual(a1.y, a2.y)
}

// 6. floatingEdgePath produces a single smooth cubic bezier anchored on both borders.
{
  const d = floatingEdgePath(rect(0, 0), rect(600, 300))
  assert.match(d, /^M 100 \S+ C .+, .+, 500 \S+$/)
}

// 7. Degenerate case (same center) must not produce NaN.
{
  const d = floatingEdgePath(rect(0, 0), rect(0, 0))
  assert.equal(d.includes('NaN'), false)
}

// 8. Subordinate ports follow the group and remain distinct from project anchors.
{
  const source = rect(0,0)
  const right = subordinatePortAnchor(source,[rect(400,0)],'horizontal')
  const left = subordinatePortAnchor(source,[rect(-400,0)],'horizontal')
  assert.equal(right.side,'right')
  assert.equal(left.side,'left')
  assert.notEqual(right.y,0)
  const curve = floatingEdgePath(source,rect(400,0),right)
  assert.ok(curve.startsWith(`M ${right.x} ${right.y} C `))
}

// 9. All subordinate edges share the port facing their visible group centroid.
{
  const source = rect(0,0)
  const group = subordinatePortAnchor(source,[rect(400,100),rect(400,-100)],'vertical')
  assert.deepEqual(group,subordinatePortAnchor(source,[rect(400,0)],'vertical'))
}

// 10. Sliding around a corner must not jump the separate attachment point.
{
  const source = rect(0,0)
  const before = subordinatePortAnchor(source,[rect(200,99.99)],'vertical')
  const after = subordinatePortAnchor(source,[rect(200,100.01)],'vertical')
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<0.5)
}

console.log('people-axis floating edges: 10 cases passed')

assert.equal(straightEdgePath(rect(0, 0), rect(600, 0)), 'M 100 0 L 500 0')
assert.equal(straightEdgePath(rect(0, 0), rect(600, 300)), 'M 100 50 L 500 250')

// 三层树：focus 中间层时高亮到根两条 + 到两个下属两条，共 4 条；focus 为 null 返回空集
const tree = [
  { id: 'root', parentId: null },
  { id: 'l1', parentId: 'root' },
  { id: 'middle', parentId: 'l1' },
  { id: 'leaf-a', parentId: 'middle' },
  { id: 'leaf-b', parentId: 'middle' },
]
assert.deepEqual(
  highlightEdgeIds(tree, 'middle'),
  new Set(['branch-middle', 'branch-l1', 'branch-leaf-a', 'branch-leaf-b']),
)
assert.deepEqual(highlightEdgeIds(tree, null), new Set())

// 横向：15px 吸附、17px 不吸附
const hSnap15 = snapToParentAxis({ x: 300, y: 15 }, { width: 240, height: 168 }, { x: 0, y: 0 }, 'horizontal', 16)
assert.equal(hSnap15.snapped, true)
assert.equal(hSnap15.pos.y, 0)
assert.ok(hSnap15.guide)
const hSnap17 = snapToParentAxis({ x: 300, y: 17 }, { width: 240, height: 168 }, { x: 0, y: 0 }, 'horizontal', 16)
assert.equal(hSnap17.snapped, false)
assert.equal(hSnap17.pos.y, 17)
assert.equal(hSnap17.guide, null)

// 纵向：15px 吸附、17px 不吸附
const vSnap15 = snapToParentAxis({ x: 15, y: 300 }, { width: 240, height: 168 }, { x: 0, y: 0 }, 'vertical', 16)
assert.equal(vSnap15.snapped, true)
assert.equal(vSnap15.pos.x, 0)
assert.ok(vSnap15.guide)
const vSnap17 = snapToParentAxis({ x: 17, y: 300 }, { width: 240, height: 168 }, { x: 0, y: 0 }, 'vertical', 16)
assert.equal(vSnap17.snapped, false)
assert.equal(vSnap17.pos.x, 17)
assert.equal(vSnap17.guide, null)

console.log('people-axis edge helpers: straight/highlight/snap cases passed')
