import assert from 'node:assert/strict'
import { borderAnchor, floatingEdgePath, type RectCoords } from '../src/components/views/peopleAxisUtils'

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

console.log('people-axis floating edges: 7 cases passed')
