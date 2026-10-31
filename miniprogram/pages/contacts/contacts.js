const request=require('../../utils/request')
Page({
  data:{companyId:null,contacts:[],filteredContacts:[],query:'',loading:true,creatingChat:false,error:''},
  async onLoad(options){
    const companyId=Number(options.companyId)
    if(!companyId){this.setData({loading:false,error:'请先加入公司'});return}
    this.setData({companyId})
    await this.loadContacts()
  },
  async loadContacts(){
    this.setData({loading:true,error:''})
    try{
      const response=await request.get('/companies/'+this.data.companyId+'/contacts')
      const contacts=(response.data&&response.data.items)||[]
      this.setData({contacts,filteredContacts:contacts,loading:false})
    }catch(error){this.setData({loading:false,error:error.message||'联系人加载失败'})}
  },
  onSearch(event){const query=event.detail.value;this.setData({query,filteredContacts:this.data.contacts.filter(c=>c.name.includes(query.trim()))})},
  async startPrivateChat(event){
    const {id,name}=event.currentTarget.dataset
    if(!id||this.data.creatingChat)return
    this.setData({creatingChat:true,error:''})
    try{
      const response=await request.post('/companies/'+this.data.companyId+'/conversations',{member_user_ids:[Number(id)]})
      if(!response.data||!response.data.id)throw new Error('会话创建失败')
      this.getOpenerEventChannel().emit('conversationCreated',{id:response.data.id,name})
      wx.navigateBack()
    }catch(error){this.setData({error:error.message||'会话创建失败'})}
    finally{this.setData({creatingChat:false})}
  }
})
