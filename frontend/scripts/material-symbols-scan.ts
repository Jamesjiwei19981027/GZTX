/**
 * 扫描 src 中用到的 Material Symbols 图标名（守护测试与子集生成脚本共用，
 * 保证两边口径一致）。
 *
 * 收集三类写法：
 * 1. JSX 字面量：<span className="material-symbols-outlined ...">bolt</span>
 * 2. 对象字面量：icon: 'hub' / icon="hub" / icon={'hub'}
 * 3. span 内表达式中的字符串字面量（三元等）：
 *    <span className="material-symbols-outlined">{done ? 'replay' : 'check_circle'}</span>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const NAME_RE = /^[a-z][a-z0-9_]{1,}$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p)
  }
  return out
}

export function scanIcons(srcDir: string): string[] {
  const found = new Set<string>()
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf-8')

    // icon: 'name' / icon="name" / icon={'name'}
    for (const m of text.matchAll(/\bicon(?::\s*|=\{?\s*)['"]([a-z][a-z0-9_]+)['"]/g)) {
      found.add(m[1])
    }

    // material-symbols-outlined 元素：取开标签闭合 > 到 </span> 之间的内容
    for (const m of text.matchAll(/material-symbols-outlined[^"']*["'][^>]*>/g)) {
      const start = (m.index ?? 0) + m[0].length
      const end = text.indexOf('</span>', start)
      if (end < 0) continue
      const inner = text.slice(start, Math.min(end, start + 500))
      const literal = inner.trim()
      if (NAME_RE.test(literal)) found.add(literal)
      // 表达式内的字符串字面量（三元 / 条件）
      for (const s of inner.matchAll(/['"]([a-z][a-z0-9_]+)['"]/g)) {
        found.add(s[1])
      }
    }
  }
  return [...found].sort()
}
