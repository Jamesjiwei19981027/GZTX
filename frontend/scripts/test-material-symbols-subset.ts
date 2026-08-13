/**
 * 守护测试：Material Symbols 子集是否与源码用到的图标同步。
 * 新增/删除图标后需要重新运行 `npm run icons:subset` 并提交产物。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanIcons } from './material-symbols-scan'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'src', 'assets', 'material-symbols-icons.json')
const fontPath = join(root, 'src', 'assets', 'material-symbols-outlined-subset.woff2')

let failed = false
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    failed = true
  }
}

assert(existsSync(manifestPath), 'material-symbols-icons.json 缺失，先跑 npm run icons:subset')
assert(existsSync(fontPath), '子集字体 woff2 缺失，先跑 npm run icons:subset')

if (existsSync(manifestPath) && existsSync(fontPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
    scanned: string[]
    subset: string[]
  }
  const fresh = scanIcons(join(root, 'src'))
  const recorded = new Set(manifest.scanned)
  const missing = fresh.filter((n) => !recorded.has(n))
  const stale = manifest.scanned.filter((n) => !new Set(fresh).has(n))
  assert(
    missing.length === 0,
    `源码新增了图标但子集未更新：${missing.join(', ')}（跑 npm run icons:subset 后提交产物）`,
  )
  assert(
    stale.length === 0,
    `子集清单里有源码已不再使用的图标：${stale.join(', ')}（跑 npm run icons:subset 后提交产物）`,
  )
  assert(manifest.subset.length > 0, 'manifest.subset 为空，子集生成异常')
  const size = statSync(fontPath).size
  assert(size > 1024, `子集字体过小（${size}B），生成可能失败`)
  assert(size < 1024 * 1024, `子集字体过大（${(size / 1024).toFixed(0)}KB），子集化可能失效`)
  if (!failed) {
    console.log(
      `material-symbols subset OK: ${manifest.subset.length} icons, ${(size / 1024).toFixed(0)} KB`,
    )
  }
}

if (failed) process.exit(1)
