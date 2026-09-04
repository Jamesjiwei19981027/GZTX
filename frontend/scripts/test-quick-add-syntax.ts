/**
 * 快速添加语法糖：`#标签` 与 `p0/p1/p2`。
 *
 * 回归点：记号必须从标题里剔除（否则「修复登录 p0」会把 p0 当标题内容存下去），
 * 且不能吃掉 URL 锚点这类非标签的 `#`。
 */
import assert from 'node:assert/strict'
import { parseQuickAddSyntax } from '../src/utils/quickAddSyntax'

let count = 0
function check(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label)
  count += 1
}

// 纯文本：不产生标签/优先级
const plain = parseQuickAddSyntax('提交周报')
check(plain.title, '提交周报', '纯文本标题不变')
check(plain.tags, [], '纯文本无标签')
check(plain.priority, undefined, '纯文本无优先级')

// 单个标签
const oneTag = parseQuickAddSyntax('提交周报 #汇报')
check(oneTag.title, '提交周报', '标签从标题剔除')
check(oneTag.tag, '汇报', '首个标签作为 tag')
check(oneTag.tags, ['汇报'], '标签清单')

// 多个标签按序去重
const many = parseQuickAddSyntax('#前端 修复登录 #前端 #紧急')
check(many.tags, ['前端', '紧急'], '重复标签去重且保序')
check(many.title, '修复登录', '多标签剔除后标题干净')

// 优先级：p0 最紧急
check(parseQuickAddSyntax('修复登录 p0').priority, 'High', 'p0 → High')
check(parseQuickAddSyntax('写文档 p1').priority, 'Medium', 'p1 → Medium')
check(parseQuickAddSyntax('清理日志 p2').priority, 'Low', 'p2 → Low')
check(parseQuickAddSyntax('修复登录 p0').title, '修复登录', '优先级记号剔除')

// 大写与行首
check(parseQuickAddSyntax('P0 紧急修复').priority, 'High', '大写 P0 也识别')
check(parseQuickAddSyntax('P0 紧急修复').title, '紧急修复', '行首记号剔除')

// 多个优先级时第一个生效
check(parseQuickAddSyntax('活儿 p0 p2').priority, 'High', '首个优先级生效')

// 组合：时间短语已由 nlDate 摘掉，这里只处理剩余部分
const combo = parseQuickAddSyntax('提交周报 #汇报 p0')
check(combo.title, '提交周报', '组合后标题干净')
check(combo.tag, '汇报', '组合后标签正确')
check(combo.priority, 'High', '组合后优先级正确')

// 不该误伤：URL 锚点、单词内的 p0、纯 # 号
check(parseQuickAddSyntax('看 https://x.com/a#b').tags, [], 'URL 锚点不当标签')
check(parseQuickAddSyntax('升级到 step0 版本').priority, undefined, '词内 p0 不算优先级')
check(parseQuickAddSyntax('标题 #').tags, [], '孤立 # 不算标签')

// 全是记号时标题为空，由调用方回退原始输入
check(parseQuickAddSyntax('#标签 p0').title, '', '只有记号则标题为空')

console.log(`quick-add syntax: ${count} assertions passed`)
