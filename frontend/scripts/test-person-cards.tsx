import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mergeCard, moveField } from '../src/features/personCards/model'
import { CardFields, FoldedCardLabel } from '../src/features/personCards/CardFields'
import type { PeopleAxisNode } from '../src/types'

const template = { fields: ['name', 'role'] as const, density: 'detailed' as const, color: 'sage' as const }
const style = { fields: ['tags', 'name'] as const, color: 'clay' as const, tags: [{ text: '驻场', color: 'rose' as const }], custom_fields: [{ key: '地点', value: '上海' }] }
const snapshot = JSON.stringify({ template, style })
const resolved = mergeCard(template, style, { fields: ['custom_fields', 'name'], density: 'compact', show_colors: false, show_tags: false })
assert.deepEqual(resolved.fields, ['custom_fields', 'name'])
assert.equal(resolved.color, 'ink')
assert.equal(resolved.density, 'compact')
assert.deepEqual(resolved.tags, [])
assert.deepEqual(resolved.custom_fields, [{ key: '地点', value: '上海' }])
assert.equal(JSON.stringify({ template, style }), snapshot, '合并不能修改传入配置')
assert.deepEqual(mergeCard(template, { fields: [] }, {}).fields, [])
assert.deepEqual(mergeCard(template, {}, {}).fields, ['name', 'role'])
assert.deepEqual(moveField(['name', 'role', 'tags'], 'tags', 'name'), ['tags', 'name', 'role'])
assert.deepEqual(moveField(['name'], 'name', 'missing'), ['name'])
const node: PeopleAxisNode = { id: '1', person: { id: '2', name: '林悦', role: '成员', avatar: '' }, roleTitle: '设计师', orderOnAxis: 0, workItems: [], cardStyle: style }
const html = renderToStaticMarkup(<CardFields node={node} config={resolved} />)
assert.ok(html.includes('地点') && html.includes('上海') && html.includes('林悦'))
assert.ok(html.indexOf('>上海<') < html.indexOf('>林悦<'), '可见内容必须遵从覆盖后的字段顺序')
assert.ok(!html.includes('设计师') && !html.includes('驻场'))
assert.ok(!renderToStaticMarkup(<CardFields node={node} config={mergeCard({}, { fields: [] })} />).includes('>林悦<'))
const folded = renderToStaticMarkup(<FoldedCardLabel node={node} config={mergeCard({}, style)} />)
assert.ok(folded.includes('林悦') && folded.includes('驻场') && folded.includes('card-color-dot'))
assert.ok(!renderToStaticMarkup(<FoldedCardLabel node={node} config={mergeCard({}, style, { show_tags: false })} />).includes('驻场'))
console.log('person cards: inheritance, ordering, empty fields, private masking, rendering and folded labels passed')
