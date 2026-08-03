/**
 * antd v5+ 静态 message 无法消费 ConfigProvider 主题，会告警：
 * "Static function can not consume context like dynamic theme."
 * 这里提供一个桥：App 组件挂载后由 AntdMessageBridge 注入上下文实例，
 * 业务代码统一从本模块导入 message，用法与 antd 静态 message 一致。
 */
import { message as staticMessage } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'

let impl: MessageInstance | null = null

export function setMessageImpl(instance: MessageInstance) {
  impl = instance
}

type StaticApi = typeof staticMessage

function current(): MessageInstance | StaticApi {
  return impl ?? staticMessage
}

export const message = {
  success: (...args: Parameters<MessageInstance['success']>) => current().success(...args),
  error: (...args: Parameters<MessageInstance['error']>) => current().error(...args),
  info: (...args: Parameters<MessageInstance['info']>) => current().info(...args),
  warning: (...args: Parameters<MessageInstance['warning']>) => current().warning(...args),
  loading: (...args: Parameters<MessageInstance['loading']>) => current().loading(...args),
  open: (...args: Parameters<MessageInstance['open']>) => current().open(...args),
}
