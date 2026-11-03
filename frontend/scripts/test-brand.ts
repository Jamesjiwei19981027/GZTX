import { BRAND } from '../src/constants/brand'

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

assertEqual(BRAND.zh.name, '烂笔头', '中文品牌名')
assertEqual(BRAND.en.name, 'WorkTodo', '英文品牌名')
console.log('brand names OK')
