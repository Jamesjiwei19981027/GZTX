import assert from 'node:assert/strict'
import { normalizeTaskScope } from '../src/utils/taskScope'

console.log('--- Testing normalizeTaskScope ---')
assert.deepEqual(normalizeTaskScope('all'), { project_id: null, origin: 'personal' })
assert.deepEqual(normalizeTaskScope(null), { project_id: null, origin: 'personal' })
assert.deepEqual(normalizeTaskScope(undefined), { project_id: null, origin: 'personal' })
assert.deepEqual(normalizeTaskScope(''), { project_id: null, origin: 'personal' })
assert.deepEqual(normalizeTaskScope('2'), { project_id: 2, origin: 'project_link' })
assert.deepEqual(normalizeTaskScope('101'), { project_id: 101, origin: 'project_link' })

assert.throws(() => normalizeTaskScope('invalid'))
assert.throws(() => normalizeTaskScope('-1'))
assert.throws(() => normalizeTaskScope('0'))
assert.throws(() => normalizeTaskScope('1.5'))

console.log('All normalizeTaskScope assertions PASSED!')
