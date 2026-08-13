/**
 * 中文自然语言日期解析器（纯函数、零第三方依赖）。
 *
 * 支持的表达：
 * - 相对日：今天 / 明天 / 后天 / 大后天
 * - 星期：本周X / 这周X / 下周X（X = 一~六、日、天；周一为一周起点）
 * - 月日：X月X日 / X月X号（已过去的月日按「说的是明年」理解）
 * - 时刻：上午/下午/晚上 X点、X点半、X点X分（数字支持阿拉伯与常用中文数字）
 * - 相对时长：X小时后 / X分钟后（支持「X个小时后」）
 *
 * 规则：
 * - 只取文本中第一个匹配短语；同一起点按 日期 > 相对时长 > 时刻 优先。
 * - 日期短语后紧邻（允许空白）的时刻短语会组合，如「明天下午3点」。
 * - 只有日期没有时刻时默认当天 18:00：贴近一般下班时间，符合「当天要完成」
 *   的普遍预期，同时避免默认 00:00 让任务一创建就显示为已过期。
 * - 解析不出（或短语数值非法，如 25点）时返回 date=null 且 cleanedText=原文。
 */

export interface NlDateResult {
  /** 解析出的截止时间；无法解析时为 null */
  date: Date | null
  /** 剥离匹配短语并收敛多余空格后的标题；未匹配时等于原文 */
  cleanedText: string
  /** 命中的原始短语（含组合的时刻部分）；未匹配时为 null */
  matched: string | null
}

const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 数字片段：阿拉伯数字或「X十Y」形式的中文数字（覆盖 0-59 即够用） */
const NUM = '(?:\\d{1,3}|[零一二两三四五六七八九十]{1,3})'

const DATE_SRC =
  '(?:今天|明天|后天|大后天|[本这下]周[一二三四五六日天]|\\d{1,2}月\\d{1,2}[日号])'
const TIME_SRC = `(?:上午|下午|晚上)?${NUM}点(?:半|${NUM}分)?`
const REL_SRC = `(${NUM})个?(小时|分钟)后`

function cnOrDigitToInt(raw: string): number | null {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10)
  const m = /^([零一二两三四五六七八九])?(十)?([零一二两三四五六七八九])?$/.exec(raw)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  const tens = m[2] ? (m[1] ? CN_DIGIT[m[1]] : 1) : 0
  const ones = m[3] ? CN_DIGIT[m[3]] : m[2] ? 0 : m[1] ? CN_DIGIT[m[1]] : 0
  return tens * 10 + ones
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
}

/** 把日期短语解析成当日零点的 Date；非法（如 2月30日）返回 null */
function resolveDate(phrase: string, now: Date): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (phrase === '今天') return today
  if (phrase === '明天') return addDays(today, 1)
  if (phrase === '后天') return addDays(today, 2)
  if (phrase === '大后天') return addDays(today, 3)

  const wk = /^([本这下])周([一二三四五六日天])$/.exec(phrase)
  if (wk) {
    const target = wk[2] === '日' || wk[2] === '天' ? 7 : CN_DIGIT[wk[2]]
    // 周一=1 … 周日=7 的 ISO 星期序，保证「本周日」落在本周末而非上周日
    const currentIso = ((today.getDay() + 6) % 7) + 1
    const delta = target - currentIso + (wk[1] === '下' ? 7 : 0)
    return addDays(today, delta)
  }

  const md = /^(\d{1,2})月(\d{1,2})[日号]$/.exec(phrase)
  if (md) {
    const month = Number(md[1])
    const day = Number(md[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    let d = new Date(today.getFullYear(), month - 1, day)
    // Date 构造会把 2月30 溢出成 3月2，这里视为非法表达
    if (d.getMonth() !== month - 1 || d.getDate() !== day) return null
    // 已过去的月日按「说的是明年」理解（今天当天不算过去）
    if (d < today) d = new Date(today.getFullYear() + 1, month - 1, day)
    return d
  }
  return null
}

/** 把时刻短语解析成 {hour, minute}；数值越界（如 25点）返回 null */
function resolveTime(phrase: string): { hour: number; minute: number } | null {
  const m = new RegExp(`^(上午|下午|晚上)?(${NUM})点(?:(半)|(${NUM})分)?$`).exec(phrase)
  if (!m) return null
  let hour = cnOrDigitToInt(m[2]) ?? -1
  const minute = m[3] ? 30 : m[4] ? (cnOrDigitToInt(m[4]) ?? -1) : 0
  // 下午/晚上按 12 小时制补 12；「下午12点」本身已是 12 不再补
  if ((m[1] === '下午' || m[1] === '晚上') && hour >= 1 && hour < 12) hour += 12
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/** 剥离 [start, end) 区间并收敛空格，得到干净标题 */
function stripRange(text: string, start: number, end: number): string {
  return (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s+/g, ' ').trim()
}

export function parseNlDate(text: string, now: Date = new Date()): NlDateResult {
  const fail: NlDateResult = { date: null, cleanedText: text, matched: null }
  if (!text) return fail

  const dateMatch = new RegExp(DATE_SRC).exec(text)
  const relMatch = new RegExp(REL_SRC).exec(text)
  const timeMatch = new RegExp(TIME_SRC).exec(text)

  // 只取第一个匹配短语；数组顺序即同起点时的优先级（日期 > 相对时长 > 时刻）
  const candidates = (
    [
      dateMatch && { kind: 'date' as const, m: dateMatch },
      relMatch && { kind: 'rel' as const, m: relMatch },
      timeMatch && { kind: 'time' as const, m: timeMatch },
    ].filter(Boolean) as { kind: 'date' | 'rel' | 'time'; m: RegExpExecArray }[]
  ).sort((a, b) => a.m.index - b.m.index)
  if (candidates.length === 0) return fail

  const winner = candidates[0]
  const start = winner.m.index
  let end = start + winner.m[0].length

  if (winner.kind === 'rel') {
    const n = cnOrDigitToInt(winner.m[1])
    if (n == null) return fail
    const ms = winner.m[2] === '小时' ? n * 3600_000 : n * 60_000
    return {
      date: new Date(now.getTime() + ms),
      cleanedText: stripRange(text, start, end),
      matched: winner.m[0],
    }
  }

  if (winner.kind === 'time') {
    const t = resolveTime(winner.m[0])
    if (!t) return fail
    // 只有时刻没有日期时按「今天的这个时刻」理解，不做跨天猜测
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.hour, t.minute)
    return { date, cleanedText: stripRange(text, start, end), matched: winner.m[0] }
  }

  // winner.kind === 'date'
  const base = resolveDate(winner.m[0], now)
  if (!base) return fail
  // 只有日期时默认 18:00（理由见文件头注释）
  let hour = 18
  let minute = 0
  const adjacent = new RegExp(`^\\s*(${TIME_SRC})`).exec(text.slice(end))
  if (adjacent) {
    const t = resolveTime(adjacent[1])
    if (!t) return fail
    hour = t.hour
    minute = t.minute
    end += adjacent[0].length
  }
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute)
  return {
    date,
    cleanedText: stripRange(text, start, end),
    matched: text.slice(start, end),
  }
}
