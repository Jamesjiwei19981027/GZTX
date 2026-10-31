const test=require('node:test')
const assert=require('node:assert/strict')
const {readFileSync}=require('node:fs')
const {runInNewContext}=require('node:vm')
const path=require('node:path')

test('project detail fetches all project task pages and expands each status',async()=>{
  let definition
  const calls=[]
  const request={get:async url=>{
    calls.push(url)
    if(url.endsWith('/members'))return {data:{items:[{id:1}]}}
    if(url.includes('/tasks?'))return url.includes('page=2&')?{data:{items:[{id:3,title:'已完成',status:2}],total:3}}:{data:{items:[{id:1,title:'待办',status:0},{id:2,title:'进行中',status:1}],total:3}}
    return {data:{id:1,name:'项目'}}
  },post:async()=>({data:{token:'invite-1'}})}
  runInNewContext(readFileSync(path.join(__dirname,'../pages/project-detail/project-detail.js'),'utf8'),{Page:p=>{definition=p},require:()=>request,wx:{setNavigationBarTitle(){},showToast(){}}})
  const page={...definition,data:{...definition.data},setData(value){Object.assign(this.data,value)}}
  await page.onLoad({id:'1'})
  assert.equal(page.data.tasks.length,3)
  assert.equal(page.data.columns.length,3)
  assert.equal(page.data.columns[2].tasks[0].title,'已完成')
  assert.ok(calls.every(url=>url.startsWith('/projects/1')))
  assert.ok(calls.some(url=>url.includes('page=2&')))
})
