import assert from 'node:assert/strict'
import {
  dateFromIso,
  formatDateLocal,
  shiftCalendarCursor,
} from '../src/components/views/calendarUtils'
import { averagePeopleAxisProgress } from '../src/components/views/peopleAxisUtils'

const cursor = new Date(2026, 0, 31)
assert.equal(formatDateLocal(shiftCalendarCursor(cursor, 'month', 1)), '2026-02-01')
assert.equal(formatDateLocal(shiftCalendarCursor(cursor, 'month', -1)), '2025-12-01')
assert.equal(formatDateLocal(shiftCalendarCursor(cursor, 'week', 1)), '2026-02-07')
assert.equal(formatDateLocal(shiftCalendarCursor(cursor, 'day', -1)), '2026-01-30')
assert.equal(formatDateLocal(dateFromIso('2026-08-03')), '2026-08-03')
assert.equal(averagePeopleAxisProgress([]), 0)
assert.equal(
  averagePeopleAxisProgress([
    { workItems: [{ progress: 20, status: 'In Progress' }, { progress: 80, status: 'In Progress' }] },
  ]),
  50,
)
console.log('calendar and people-axis utils: 7 assertions passed')
