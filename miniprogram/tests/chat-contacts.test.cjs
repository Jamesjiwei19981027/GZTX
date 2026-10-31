const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const path = require('node:path')

test('mini-program lists work contacts and creates chat only after explicit selection', async () => {
  const calls = []
  let definition
  const request = {
    get: async url => {
      calls.push(['GET', url])
      if (url.endsWith('/contacts')) return { data: { items: [{ id: 8, name: '直属领导' }] } }
      if (url.endsWith('/conversations')) return { data: { items: [{ id: 20, title: '直属领导' }] } }
      return { data: { items: [] } }
    },
    post: async (url, body) => { calls.push(['POST', url, body]); return { data: { id: 20 } } }
  }
  const contactPage = path.join(__dirname, '../pages/contacts/contacts.js')
  assert.ok(existsSync(contactPage), '工作联系人必须有独立页面')
  runInNewContext(readFileSync(contactPage, 'utf8'), {
    Page: value => { definition = value }, require: () => request, wx: { showToast() {},navigateBack() {} }
  })
  const emitted=[]
  const page = { ...definition, data: { ...definition.data, companyId: 1 },
    getOpenerEventChannel(){return {emit:(name,data)=>emitted.push({name,data})}},
    setData(value) { Object.assign(this.data, value) } }
  await page.onLoad({companyId:'1'})
  assert.equal(page.data.contacts[0].name, '直属领导')
  assert.equal(calls.filter(c => c[0] === 'POST').length, 0)
  await page.startPrivateChat({ currentTarget: { dataset: { id: 8, name: '直属领导' } } })
  const create = calls.find(c => c[0] === 'POST')
  assert.equal(create[1], '/companies/1/conversations')
  assert.equal(JSON.stringify(create[2]), '{"member_user_ids":[8]}')
  assert.equal(emitted[0].name,'conversationCreated')
  assert.equal(emitted[0].data.id,20)
  const app=JSON.parse(readFileSync(path.join(__dirname,'../app.json'),'utf8'))
  assert.ok(app.pages.includes('pages/contacts/contacts'))
})
