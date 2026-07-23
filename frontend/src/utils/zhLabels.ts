/** 与 APP 公司设置/节点展示同语义的中文映射 */

export function zhStatus(raw: unknown): string {
  switch (String(raw)) {
    case 'active':
      return '生效中'
    case 'inactive':
      return '已停用'
    case 'pending':
    case 'pending_license':
      return '待启用'
    case 'suspended':
      return '已暂停'
    case 'readonly':
      return '只读'
    case 'draft':
      return '草稿'
    case 'archived':
      return '已归档'
    case 'null':
    case '':
      return '-'
    default:
      return String(raw ?? '-')
  }
}

export function zhPolicy(raw: unknown): string {
  switch (String(raw)) {
    case 'standard':
      return '标准'
    case 'strict':
      return '严格'
    case 'relaxed':
      return '宽松'
    default:
      return String(raw ?? '-')
  }
}

export function zhBool(raw: unknown): string {
  if (raw === true || String(raw) === 'true') return '是'
  if (raw === false || String(raw) === 'false') return '否'
  return String(raw ?? '-')
}

export function zhLoginMethod(key: string): string {
  switch (key) {
    case 'password':
      return '账号密码'
    case 'wechat':
      return '微信'
    case 'wecom':
      return '企业微信'
    case 'dingtalk':
      return '钉钉'
    case 'feishu':
      return '飞书'
    case 'email':
      return '邮箱'
    case 'phone':
      return '手机号'
    case 'oidc':
      return 'OIDC'
    default:
      return key
  }
}

export function zhFeatureKey(key: string): string {
  switch (key) {
    case 'project_tree':
      return '项目树'
    case 'agents':
      return '智能体'
    case 'org_sync':
      return '组织同步'
    case 'policy_isolated':
      return '策略隔离'
    case 'asr':
      return '语音识别'
    case 'custom_storage':
      return '自定义存储'
    default:
      return key
  }
}

export function zhCapability(key: string): string {
  switch (key) {
    case 'storage':
      return '存储'
    case 'asr':
      return '语音识别'
    case 'model':
      return '大模型'
    default:
      return key
  }
}

export function zhProvider(id: string | null | undefined): string {
  if (!id) return '未配置'
  switch (id) {
    case 'local':
      return '本地'
    case 'builtin':
      return '内置'
    case 'fake':
      return '模拟'
    case 's3':
      return '对象存储（S3）'
    default:
      return id
  }
}

export function zhNodeType(key: string | null | undefined): string {
  switch (key) {
    case 'person':
      return '人'
    case 'work_item':
      return '工作项'
    case 'milestone':
      return '里程碑'
    case 'scope':
      return '范围'
    default:
      return key || '节点'
  }
}
