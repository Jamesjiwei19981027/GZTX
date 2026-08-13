/**
 * 生成 Material Symbols 子集字体：
 * 1. 扫描 src 用到的图标名，写入 src/assets/material-symbols-icons.json
 * 2. 调 Python(fonttools) 裁剪连字生成 src/assets/material-symbols-outlined-subset.woff2
 *
 * 用法：npm run icons:subset（需要 python + `pip install fonttools brotli`）
 * 产物提交进仓库，构建不依赖 Python。
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanIcons } from './material-symbols-scan'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'src', 'assets', 'material-symbols-icons.json')

const scanned = scanIcons(join(root, 'src'))
writeFileSync(
  manifestPath,
  JSON.stringify({ scanned, subset: [] }, null, 2) + '\n',
)
console.log(`scanned ${scanned.length} icon candidates -> ${manifestPath}`)

execFileSync('python', [join(root, 'scripts', 'subset_material_symbols.py')], {
  stdio: 'inherit',
})
