import assert from 'node:assert/strict'
import { parseNlDate } from '../src/utils/nlDate'

// 固定基准：2026-08-13 周四 10:00，保证断言与运行日期无关
const NOW = new Date(2026, 7, 13, 10, 0, 0)

function fmt(d: Date | null): string {
  if (!d) return 'null'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

let count = 0
function check(input: string, expectDate: string | null, expectCleaned: string, expectMatched: string | null) {
  const r = parseNlDate(input, NOW)
  assert.equal(fmt(r.date), expectDate ?? 'null', `date of ${JSON.stringify(input)}`)
  assert.equal(r.cleanedText, expectCleaned, `cleanedText of ${JSON.stringify(input)}`)
  assert.equal(r.matched, expectMatched, `matched of ${JSON.stringify(input)}`)
  count += 3
}

// 相对日（仅日期默认 18:00）
check('今天交报告', '2026-08-13 18:00', '交报告', '今天')
check('明天 提交周报', '2026-08-14 18:00', '提交周报', '明天')
check('大后天验收', '2026-08-16 18:00', '验收', '大后天')

// 日期 + 相邻时刻组合
check('明天下午3点 开会', '2026-08-14 15:00', '开会', '明天下午3点')
check('后天上午10点提交材料', '2026-08-15 10:00', '提交材料', '后天上午10点')
check('9月1号上午9点 开学准备', '2026-09-01 09:00', '开学准备', '9月1号上午9点')

// 星期（周一为起点；今天是周四）
check('本周五 评审', '2026-08-14 18:00', '评审', '本周五')
check('下周一 例会', '2026-08-17 18:00', '例会', '下周一')
check('下周日 值班', '2026-08-23 18:00', '值班', '下周日')

// 月日（已过去的月日滚到明年）
check('8月20日 发布', '2026-08-20 18:00', '发布', '8月20日')
check('1月5日 制定年度计划', '2027-01-05 18:00', '制定年度计划', '1月5日')

// 仅时刻（按今天理解）
check('晚上8点半 复盘', '2026-08-13 20:30', '复盘', '晚上8点半')
check('下午3点20分 面试', '2026-08-13 15:20', '面试', '下午3点20分')
check('下午三点 电话沟通', '2026-08-13 15:00', '电话沟通', '下午三点')

// 相对时长
check('3小时后 提醒我看进度', '2026-08-13 13:00', '提醒我看进度', '3小时后')
check('30分钟后跟进客户', '2026-08-13 10:30', '跟进客户', '30分钟后')
check('两个小时后同步结论', '2026-08-13 12:00', '同步结论', '两个小时后')

// 只取第一个匹配短语
check('明天 和 后天 都要巡检', '2026-08-14 18:00', '和 后天 都要巡检', '明天')

// 解析失败：无短语 / 非法数值，原文原样返回
check('写周报', null, '写周报', null)
check('25点开会', null, '25点开会', null)
check('2月30日 对账', null, '2月30日 对账', null)
check('', null, '', null)

console.log(`nl-date parser: ${count} assertions passed`)
