const {get,post}=require('../../utils/request')
const items=response=>Array.isArray(response.data)?response.data:(response.data&&response.data.items)||[]
Page({
  data:{project:null,members:[],tasks:[],columns:[],loading:true,error:'',showInvite:false,inviteEmail:'',inviteToken:'',inviteBusy:false,inviteError:''},
  async onLoad(options){
    this.projectId=Number(options.id)
    if(!this.projectId){this.setData({loading:false,error:'项目不存在'});return}
    await this.loadProject()
  },
  async loadProject(){
    this.setData({loading:true,error:''})
    try{
      const [project,members]=await Promise.all([get('/projects/'+this.projectId),get('/projects/'+this.projectId+'/members')])
      const tasks=[]
      for(let page=1;;page++){
        const response=await get('/projects/'+this.projectId+'/tasks?page='+page+'&page_size=200')
        const batch=items(response);tasks.push(...batch)
        if(!batch.length||tasks.length>=response.data.total)break
      }
      const columns=[{status:0,title:'待办'},{status:1,title:'进行中'},{status:2,title:'已完成'}].map(column=>({...column,tasks:tasks.filter(task=>Number(task.status)===column.status)}))
      this.setData({project:project.data,members:items(members),tasks:tasks.map(task=>({...task,statusLabel:['待办','进行中','已完成'][Number(task.status)]||'待办'})),columns,loading:false})
      wx.setNavigationBarTitle({title:project.data.name||'项目详情'})
    }catch(error){this.setData({loading:false,error:error.message||'项目加载失败'})}
  },
  toggleInvite(){this.setData({showInvite:!this.data.showInvite})},
  onInviteEmail(event){this.setData({inviteEmail:event.detail.value})},
  async createInvite(){
    const email=this.data.inviteEmail.trim()
    if(!email){this.setData({inviteError:'请输入成员邮箱'});return}
    this.setData({inviteBusy:true,inviteError:'',inviteToken:''})
    try{const response=await post('/projects/'+this.projectId+'/invitations',{email});this.setData({inviteToken:response.data.token})}
    catch(error){this.setData({inviteError:error.message||'邀请生成失败'})}
    finally{this.setData({inviteBusy:false})}
  },
  copyInvite(){wx.setClipboardData({data:this.data.inviteToken})},
  openTask(event){wx.navigateTo({url:'/pages/task-detail/task-detail?id='+event.currentTarget.dataset.id})},
  openAxis(){wx.navigateTo({url:'/pages/people-axis/people-axis?project_id='+this.projectId})},
  openProjectKnowledge(){if(this.data.project&&!this.data.loading)wx.navigateTo({url:'/pages/project-knowledge/project-knowledge?project_id='+this.projectId+'&project_name='+encodeURIComponent(this.data.project.name||'')})},
  onPullDownRefresh(){this.loadProject().then(()=>wx.stopPullDownRefresh())}
})
