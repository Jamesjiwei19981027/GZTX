import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes'
import { useTheme } from '@/hooks/useTheme'
import { setMessageImpl } from '@/utils/antdMessage'

/** 把 App 上下文里的 message 实例注入桥模块，让全站 message 提示跟随主题 */
function AntdMessageBridge() {
  const { message } = AntdApp.useApp()
  setMessageImpl(message)
  return null
}

export default function App() {
  const { isDark } = useTheme()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <AntdApp>
        <AntdMessageBridge />
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  )
}
