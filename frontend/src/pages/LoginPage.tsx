import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Form, Input, Button, Checkbox, message } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/stores/auth'
import { getToken, getErrorMessage } from '@/api/request'

type LoginPageProps = {
  register?: boolean
}

type LoginFormValues = {
  username: string
  password: string
  remember?: boolean
}

type RegisterFormValues = {
  username: string
  email: string
  password: string
  confirmPassword: string
}

const featurePills = ['任务管理', '团队协作', '实时消息', '文件共享', '项目看板']

export default function LoginPage({ register: registerProp }: LoginPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isRegister = registerProp === true || location.pathname === '/register'

  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)

  const [loginForm] = Form.useForm<LoginFormValues>()
  const [registerForm] = Form.useForm<RegisterFormValues>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (getToken()) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    loginForm.resetFields()
    registerForm.resetFields()
  }, [isRegister, loginForm, registerForm])

  function switchMode(toRegister: boolean) {
    navigate(toRegister ? '/register' : '/login')
  }

  async function handleLogin(values: LoginFormValues) {
    setSubmitting(true)
    try {
      await login(values.username, values.password)
      message.success('登录成功')
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err, '登录失败'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegister(values: RegisterFormValues) {
    setSubmitting(true)
    try {
      await register({
        username: values.username,
        password: values.password,
        email: values.email,
        nickname: values.username,
      })
      // company_join tip already shown by auth store
      navigate('/dashboard', { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err, '注册失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || loading

  return (
    <div className="min-h-screen flex">
      {/* Left Column: Hero */}
      <div
        className="hidden md:flex md:w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0058be 0%, #2170e4 100%)' }}
      >
        <div className="absolute w-[500px] h-[500px] rounded-full bg-on-primary/5 -top-32 -left-32" />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-on-primary/5 bottom-20 -right-20" />
        <div className="absolute w-[200px] h-[200px] rounded-full bg-on-primary/5 top-1/3 right-1/4" />
        <div className="absolute w-[150px] h-[150px] rounded-full bg-on-primary/5 bottom-10 left-1/4" />

        <div className="relative z-10 text-center px-xl">
          <div className="w-20 h-20 rounded-2xl bg-on-primary/10 flex items-center justify-center mx-auto mb-lg backdrop-blur-sm">
            <span className="material-symbols-outlined text-on-primary text-5xl">bolt</span>
          </div>
          <h1 className="text-4xl font-bold text-on-primary mb-sm tracking-tight">Flow 生产力</h1>
          <p className="text-lg text-on-primary/80 mb-xl">保持专注，提升效率</p>

          <div className="w-64 h-48 mx-auto mb-xl rounded-2xl bg-on-primary/5 backdrop-blur-sm border border-on-primary/10 flex items-center justify-center">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-on-primary/60 text-3xl">dashboard</span>
              <span className="material-symbols-outlined text-on-primary/40 text-2xl">arrow_forward</span>
              <span className="material-symbols-outlined text-on-primary/60 text-3xl">check_circle</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-xl left-0 right-0 flex flex-wrap justify-center gap-sm px-lg">
          {featurePills.map((pill) => (
            <span
              key={pill}
              className="bg-on-primary/10 text-on-primary rounded-full px-md py-sm text-sm backdrop-blur-sm border border-on-primary/5"
            >
              {pill}
            </span>
          ))}
        </div>
      </div>

      {/* Right Column: Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-lg" style={{ backgroundColor: '#f8f9fa' }}>
        <div className="max-w-[440px] w-full">
          <div
            className="rounded-2xl p-xl"
            style={{
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Mobile logo */}
            <div className="md:hidden text-center mb-lg">
              <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-sm">
                <span className="material-symbols-outlined text-on-primary text-3xl">bolt</span>
              </div>
              <h2 className="text-xl font-bold text-on-surface">Flow 生产力</h2>
            </div>

            {/* Tab Toggle */}
            <div className="flex bg-surface-container rounded-lg p-xs mb-xl">
              <button
                type="button"
                className={[
                  'flex-1 py-sm text-sm font-medium rounded-md transition-all',
                  !isRegister ? 'shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface',
                ].join(' ')}
                style={!isRegister ? { backgroundColor: '#ffffff' } : undefined}
                onClick={() => switchMode(false)}
              >
                登录
              </button>
              <button
                type="button"
                className={[
                  'flex-1 py-sm text-sm font-medium rounded-md transition-all',
                  isRegister ? 'shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface',
                ].join(' ')}
                style={isRegister ? { backgroundColor: '#ffffff' } : undefined}
                onClick={() => switchMode(true)}
              >
                注册
              </button>
            </div>

            {!isRegister ? (
              <>
                <h3 className="text-xl font-semibold text-on-surface mb-xs">欢迎回来</h3>
                <p className="text-sm text-on-surface-variant mb-lg">登录您的账户以继续</p>

                <Form
                  form={loginForm}
                  layout="vertical"
                  size="large"
                  onFinish={(v) => void handleLogin(v)}
                  requiredMark={false}
                >
                  <Form.Item
                    label="用户名"
                    name="username"
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, max: 20, message: '用户名长度为3-20个字符' },
                    ]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
                  </Form.Item>

                  <Form.Item
                    label="密码"
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, max: 30, message: '密码长度至少6个字符' },
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                    />
                  </Form.Item>

                  <div className="flex items-center justify-between mb-lg">
                    <Form.Item name="remember" valuePropName="checked" noStyle>
                      <Checkbox>记住我</Checkbox>
                    </Form.Item>
                    <a href="#" className="text-sm text-primary hover:underline" onClick={(e) => e.preventDefault()}>
                      忘记密码？
                    </a>
                  </div>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={busy}
                      block
                      className="h-12 rounded-xl"
                      style={{ background: '#0058be' }}
                    >
                      {busy ? '登录中...' : '登录'}
                    </Button>
                  </Form.Item>
                </Form>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-on-surface mb-xs">创建账户</h3>
                <p className="text-sm text-on-surface-variant mb-lg">注册以开始使用</p>

                <Form
                  form={registerForm}
                  layout="vertical"
                  size="large"
                  onFinish={(v) => void handleRegister(v)}
                  requiredMark={false}
                >
                  <Form.Item
                    label="用户名"
                    name="username"
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, max: 20, message: '用户名长度为3-20个字符' },
                    ]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
                  </Form.Item>

                  <Form.Item
                    label="邮箱"
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱地址' },
                      { type: 'email', message: '请输入正确的邮箱地址' },
                    ]}
                  >
                    <Input prefix={<MailOutlined />} placeholder="请输入邮箱地址" autoComplete="email" />
                  </Form.Item>

                  <Form.Item
                    label="密码"
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, max: 30, message: '密码长度至少6个字符' },
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="请输入密码"
                      autoComplete="new-password"
                    />
                  </Form.Item>

                  <Form.Item
                    label="确认密码"
                    name="confirmPassword"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请再次输入密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve()
                          }
                          return Promise.reject(new Error('两次输入的密码不一致'))
                        },
                      }),
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="请再次输入密码"
                      autoComplete="new-password"
                    />
                  </Form.Item>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={busy}
                      block
                      className="h-12 rounded-xl"
                      style={{ background: '#0058be' }}
                    >
                      {busy ? '注册中...' : '注册'}
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}

            {/* Divider */}
            <div className="relative my-lg">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-md text-on-surface-variant" style={{ backgroundColor: '#ffffff' }}>
                  或继续使用
                </span>
              </div>
            </div>

            {/* Social (visual only) */}
            <div className="flex gap-sm">
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-sm h-11 border border-outline-variant rounded-xl text-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-xl">mail</span>
                Google
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-sm h-11 border border-outline-variant rounded-xl text-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-xl">code</span>
                GitHub
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-on-surface-variant mt-lg">&copy; 2024 Flow 生产力. 保留所有权利.</p>
        </div>
      </div>
    </div>
  )
}
