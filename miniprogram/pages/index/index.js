// pages/index/index.js
const { get, patch } = require('../../utils/request')
const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const today=()=>dateKey(new Date())
const items=response=>Array.isArray(response.data)?response.data:(response.data&&response.data.items)||[]

function summarizeProject(project,nodes){
  const work=[]
  const walk=list=>(list||[]).forEach(node=>{if(node.node_type_key==='work_item'||node.node_type_key==='milestone')work.push(node);walk(node.children)})
  walk(nodes)
  const percent=node=>['done','completed','reached'].includes((node.progress_json||{}).status)?100:Math.max(0,Math.min(100,Number((node.progress_json||{}).percent)||0))
  return {id:project.id,name:project.name,total:work.length,completed:work.filter(node=>percent(node)===100).length,
    percent:work.length?Math.round(work.reduce((sum,node)=>sum+percent(node),0)/work.length):0,
    overdue:work.filter(node=>percent(node)<100&&(node.due_at||node.milestone_at)&&new Date(node.due_at||node.milestone_at).getTime()<Date.now()).length}
}

Page({
  data: {
    tasks: [],
    selectedDate: today(), monthDays: [], monthLabel: '', pendingCount: 0, dueTodayCount: 0, overdueCount: 0, scheduleTasks: [], projectSummaries: [], progressLoading: true, progressError: false, moreTasks: false,
    loading: true
  },

  onShow() {
    this.fetchTasks()
  },

  async fetchTasks() {
    this.setData({ loading: true })
    await Promise.allSettled([this.loadSchedules(),this.loadProjectSummaries()])
    this.setData({loading:false})
  },

  async loadSchedules(){
    try{
      const all=[]
      let more=false
      for(let page=1;page<=10;page++){
        const response=await get('/tasks?page='+page+'&page_size=200')
        const batch=items(response)
        all.push(...batch)
        more=batch.length===200&&(!response.data.total||all.length<response.data.total)
        if(!more)break
      }
      this._allTasks=all
      const pending=all.filter(task=>Number(task.status)!==2)
      this.setData({tasks:pending,moreTasks:more,pendingCount:pending.length,dueTodayCount:pending.filter(task=>(task.due_date||'').slice(0,10)===today()).length,overdueCount:pending.filter(task=>task.due_date&&task.due_date.slice(0,10)<today()).length})
      this.updateSchedule()
    }catch(error){wx.showToast({title:error.message||'日程加载失败',icon:'none'})}
  },

  async loadProjectSummaries(){
    this.setData({progressLoading:true,progressError:false})
    try{
      const company=items(await get('/companies/mine'))[0]
      const projects=[]
      if(company){
        for(let page=1;page<=10;page++){
          const response=await get('/projects?company_id='+company.id+'&page_size=100&page='+page)
          const batch=items(response)
          projects.push(...batch)
          if(batch.length<100||(response.data.total&&projects.length>=response.data.total))break
        }
      }
      const results=await Promise.allSettled(projects.map(async project=>{
        const response=await get('/projects/'+project.id+'/tree')
        return summarizeProject(project,(response.data&&response.data.nodes)||[])
      }))
      this.setData({projectSummaries:results.map((result,i)=>result.status==='fulfilled'?result.value:{id:projects[i].id,name:projects[i].name,error:true}),progressLoading:false})
    }catch(error){this.setData({progressLoading:false,progressError:true})}
  },

  updateSchedule(){
    const selectedDate=this.data.selectedDate||today()
    const start=new Date(selectedDate+'T12:00:00')
    start.setDate(1)
    const month=start.getMonth()
    const monthLabel=`${start.getFullYear()}年${month+1}月`
    const last=new Date(start.getFullYear(),month+1,0).getDate()
    const length=Math.ceil(((start.getDay()+6)%7+last)/7)*7
    start.setDate(start.getDate()-(start.getDay()+6)%7)
    const all=this._allTasks||[]
    const monthDays=Array.from({length},(_,i)=>{
      const day=new Date(start);day.setDate(start.getDate()+i)
      const date=dateKey(day)
      return {date,label:day.getDate(),inMonth:day.getMonth()===month,selected:date===selectedDate,hasTasks:all.some(task=>(task.due_date||'').slice(0,10)===date)}
    })
    this.setData({selectedDate,monthDays,monthLabel,scheduleTasks:all.filter(task=>(task.due_date||'').slice(0,10)===selectedDate).sort((a,b)=>(a.due_time||'23:59').localeCompare(b.due_time||'23:59'))})
  },
  selectScheduleDay(event){this.setData({selectedDate:event.currentTarget.dataset.date});this.updateSchedule()},
  todaySchedule(){this.setData({selectedDate:today()});this.updateSchedule()},
  shiftMonth(event){const day=new Date(this.data.selectedDate+'T12:00:00');day.setDate(1);day.setMonth(day.getMonth()+Number(event.currentTarget.dataset.months));this.setData({selectedDate:dateKey(day)});this.updateSchedule()},
  openProject(event){wx.navigateTo({url:'/pages/project-detail/project-detail?id='+event.currentTarget.dataset.id})},
  openCalendar(){wx.switchTab({url:'/pages/calendar/calendar'})},

  async onTaskComplete(e) {
    const { id } = e.currentTarget.dataset
    try {
      // 后端是 PATCH /tasks/{id}/complete，body 字段全有默认值，传空对象即可
      await patch('/tasks/' + id + '/complete', {})
      this.fetchTasks()
      wx.showToast({ title: '已完成', icon: 'success' })
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  goToDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: '/pages/task-detail/task-detail?id=' + id })
  },

  goToAdd() {
    wx.navigateTo({ url: '/pages/task-edit/task-edit' })
  },

  goToReports() {
    wx.navigateTo({ url: '/pages/reports/reports' })
  },

  goToChat() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  onPullDownRefresh() {
    this.fetchTasks().then(() => wx.stopPullDownRefresh())
  }
})
