const test=require('node:test')
const assert=require('node:assert/strict')
const {readFileSync}=require('node:fs')
const {runInNewContext}=require('node:vm')
const path=require('node:path')

test('home calendar changes days and project summary uses formal work-item progress',async()=>{
  let definition
  const request={get:async url=>{
    if(url.startsWith('/tasks'))return {data:{items:[{id:1,title:'今天的日程',due_date:'2026-10-20',status:0}],total:1}}
    if(url==='/companies/mine')return {data:{items:[{id:1,name:'测试公司'}]}}
    if(url==='/projects')throw new Error('项目接口必须提供 company_id')
    if(url.startsWith('/projects?company_id=1'))return {data:{items:[{id:1,name:'测试项目'}],total:1}}
    return {data:{nodes:[{id:10,node_type_key:'person',children:[
      {id:11,node_type_key:'work_item',progress_json:{percent:100,status:'done'},children:[]},
      {id:12,node_type_key:'work_item',progress_json:{percent:50},children:[]}
    ]}]}}
  }}
  runInNewContext(readFileSync(path.join(__dirname,'../pages/index/index.js'),'utf8'),{Page:p=>{definition=p},require:()=>request,wx:{showToast(){}}})
  const page={...definition,data:{...definition.data,selectedDate:'2026-10-20'},setData(value){Object.assign(this.data,value)}}
  await page.fetchTasks()
  assert.equal(page.data.scheduleTasks?.[0]?.title,'今天的日程')
  assert.equal(page.data.projectSummaries?.[0]?.percent,75)
  assert.equal(page.data.monthLabel,'2026年10月')
  assert.equal(page.data.monthDays.length,35)
  assert.equal(page.data.monthDays.filter(day=>day.inMonth).length,31)
  assert.equal(page.data.monthDays[0].date,'2026-09-28')
  assert.equal(page.data.monthDays.at(-1).date,'2026-11-01')
  assert.equal(page.data.pendingCount,1)
  page.shiftMonth({currentTarget:{dataset:{months:1}}})
  assert.equal(page.data.monthLabel,'2026年11月')
  assert.equal(page.data.monthDays.filter(day=>day.inMonth).length,30)
  page.shiftMonth({currentTarget:{dataset:{months:-1}}})
  page.selectScheduleDay({currentTarget:{dataset:{date:'2026-10-21'}}})
  assert.equal(page.data.scheduleTasks.length,0)
})
