/**
 * due_date 三端契约：本地渲染 / UTC 提交。
 *
 * 回归点：历史实现对 UTC ISO 串直接 slice(0,10)，东八区用户在 08:00Z 之前
 * 看到的截止日期整体偏一天；提交时又把本地墙上时间当 UTC 发给后端。
 */
import assert from 'node:assert/strict'
import {
  fromApiDueDate,
  localDayEndToApi,
  toApiDueDate,
  toLocalDateString,
} from '../src/utils/datetime'

let count = 0
function check(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label)
  count += 1
}

// 提交：本地日期 + 时刻 → UTC ISO，与 Date 的本地时区解释一致
const localNoon = new Date(2026, 4, 28, 12, 30, 0, 0)
check(toApiDueDate('2026-05-28', '12:30'), localNoon.toISOString(), '本地 12:30 → UTC ISO')

// 只给日期：按本地 00:00 提交（全天事件口径）
const localMidnight = new Date(2026, 4, 28, 0, 0, 0, 0)
check(toApiDueDate('2026-05-28'), localMidnight.toISOString(), '只有日期按本地 00:00')
check(toApiDueDate('2026-05-28', '   '), localMidnight.toISOString(), '空白时刻等价于无时刻')

// 非法/空输入不产生垃圾载荷
check(toApiDueDate(''), undefined, '空日期 → undefined')
check(toApiDueDate(undefined), undefined, 'undefined → undefined')
check(toApiDueDate('not-a-date'), undefined, '非法日期 → undefined')

// 回读：UTC ISO → 本地日期/时刻，且与提交互为逆运算
const roundTrip = toApiDueDate('2026-05-28', '12:30')!
check(fromApiDueDate(roundTrip), { date: '2026-05-28', time: '12:30' }, '带时刻往返一致')
check(fromApiDueDate(toApiDueDate('2026-05-28')!), { date: '2026-05-28' }, '全天往返一致（无 time）')

// 本地午夜视为「只有日期」，不该回显出 00:00
const midnightBack = fromApiDueDate(localMidnight.toISOString())
check(midnightBack.time, undefined, '本地午夜不回显时刻')
check(midnightBack.date, '2026-05-28', '本地午夜日期正确')

// 空值与非法值兜底
check(fromApiDueDate(null), { date: '' }, 'null → 空日期')
check(fromApiDueDate(undefined), { date: '' }, 'undefined → 空日期')
check(fromApiDueDate('garbage-value'), { date: 'garbage-va' }, '非法值退回前 10 位')
check(toLocalDateString(null), '', 'toLocalDateString 空值')

// 跨日边界：UTC 与本地不在同一天时必须按本地日期渲染
const crossing = new Date(2026, 4, 28, 1, 0, 0, 0) // 本地 05-28 01:00
const crossingIso = crossing.toISOString()
check(toLocalDateString(crossingIso), '2026-05-28', '本地凌晨仍显示本地日期')
if (crossingIso.slice(0, 10) !== '2026-05-28') {
  // 只有当运行时区确实让 UTC 日期与本地日期分叉时，这条才有意义
  check(
    toLocalDateString(crossingIso) === crossingIso.slice(0, 10),
    false,
    '本地日期与 UTC 日期分叉时不能用 slice',
  )
}

// 范围查询端点：当天 23:59:59.999 的本地时刻
const dayEnd = new Date(2026, 4, 28, 23, 59, 59, 999)
check(localDayEndToApi('2026-05-28'), dayEnd.toISOString(), '当天结束时刻')
check(localDayEndToApi('bad'), undefined, '非法日期无端点')


// 汇报时间：后端不带时区的时间按 UTC 解析（东八区 16:13 UTC 应是次日 00:13 本地）
import { parseApiDateTime } from '../src/utils/datetime'
import { reportStatusLabel } from '../src/api/reports'
const utcMs = Date.UTC(2026, 10, 6, 16, 13, 0)
check(parseApiDateTime('2026-11-06T16:13:00').getTime(), utcMs, '无时区时间按 UTC 解析')
check(parseApiDateTime('2026-11-06T16:13:00Z').getTime(), utcMs, '带 Z 的时间不变')
check(parseApiDateTime('2026-11-07T00:13:00+08:00').getTime(), utcMs, '带偏移的时间不变')
check(parseApiDateTime(null).getTime(), NaN, '空值得到无效时间')
const localLabel = new Date(utcMs)
const pad2 = (n: number) => String(n).padStart(2, '0')
check(
  reportStatusLabel({ id: 1, status: 'submitted', submitted_at: '2026-11-06T16:13:00' } as never),
  `${pad2(localLabel.getMonth() + 1)}-${pad2(localLabel.getDate())} ${pad2(localLabel.getHours())}:${pad2(localLabel.getMinutes())} 已提交`,
  '汇报时间标签按 UTC 换算为本地',
)

console.log(`datetime contract: ${count} assertions passed`)
