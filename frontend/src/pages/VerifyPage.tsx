import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input, Tag, message } from 'antd'
import { CheckCircleFilled, MailOutlined, MobileOutlined, SafetyOutlined } from '@ant-design/icons'
import { confirmBindCode, getVerificationStatus, sendBindCode } from '@/api/auth'
import { useSendCode } from '@/hooks/useSendCode'
import { getErrorMessage } from '@/api/request'
import { useAuthStore } from '@/stores/auth'
import type { VerificationStatus } from '@/types'

type ChannelCardProps = {
  channel: 'email' | 'sms'
  boundTarget: string
  verified: boolean
  onVerified: (status: VerificationStatus) => void
}

function ChannelCard({ channel, boundTarget, verified, onVerified }: ChannelCardProps) {
  const isEmail = channel === 'email'
  const [target, setTarget] = useState(boundTarget)
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const sender = useSendCode((t) => sendBindCode(channel, t))

  useEffect(() => {
    setTarget((prev) => prev || boundTarget)
  }, [boundTarget])

  async function confirm() {
    if (!target || !code) {
      message.warning('请填写完整信息')
      return
    }
    setConfirming(true)
    try {
      const status = await confirmBindCode(channel, target, code)
      message.success(isEmail ? '邮箱验证成功' : '手机验证成功')
      if (status) onVerified(status)
    } catch (err) {
      message.error(getErrorMessage(err, '验证失败'))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-sm">
          {isEmail ? <MailOutlined /> : <MobileOutlined />}
          {isEmail ? '邮箱验证' : '手机验证'}
          {verified && (
            <Tag color="success" icon={<CheckCircleFilled />}>
              已验证
            </Tag>
          )}
        </span>
      }
      className="w-full"
    >
      {verified ? (
        <p className="text-on-surface-variant m-0">{boundTarget || '已完成验证'}</p>
      ) : (
        <div className="flex flex-col gap-sm">
          <Input
            prefix={isEmail ? <MailOutlined /> : <MobileOutlined />}
            placeholder={isEmail ? '请输入邮箱地址' : '请输入手机号'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <div className="flex gap-sm">
            <Input
              prefix={<SafetyOutlined />}
              placeholder="6 位验证码"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              loading={sender.sending}
              disabled={sender.countdown > 0}
              onClick={() => void sender.send(target)}
            >
              {sender.countdown > 0 ? `${sender.countdown}s` : '获取验证码'}
            </Button>
          </div>
          <Button type="primary" loading={confirming} onClick={() => void confirm()}>
            确认验证
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function VerifyPage() {
  const navigate = useNavigate()
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser)
  const logout = useAuthStore((s) => s.logout)
  const [status, setStatus] = useState<VerificationStatus | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const st = await getVerificationStatus()
        setStatus(st)
        if (st?.is_verified) navigate('/dashboard', { replace: true })
      } catch (err) {
        message.error(getErrorMessage(err, '加载验证状态失败'))
      }
    })()
  }, [navigate])

  async function handleVerified(st: VerificationStatus) {
    setStatus(st)
    if (st.is_verified) {
      await fetchCurrentUser()
      message.success('全部验证完成')
      navigate('/dashboard', { replace: true })
    }
  }

  const emailDone = status?.email_verified ?? false

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-low p-lg">
      <div className="max-w-[480px] w-full flex flex-col gap-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-on-surface mb-xs">绑定手机号</h2>
          <p className="text-on-surface-variant m-0">
            {emailDone
              ? '还差一步：绑定手机号后即可使用全部功能'
              : '需完成邮箱与手机验证后才能使用全部功能'}
          </p>
        </div>

        <ChannelCard
          channel="sms"
          boundTarget={status?.phone || ''}
          verified={status?.phone_verified ?? false}
          onVerified={(st) => void handleVerified(st)}
        />
        {/* 邮箱通常在注册时已验证；微信登录等无邮箱账号才需要补验 */}
        {!emailDone && (
          <ChannelCard
            channel="email"
            boundTarget={status?.email || ''}
            verified={emailDone}
            onVerified={(st) => void handleVerified(st)}
          />
        )}

        <Button type="link" onClick={() => void logout().then(() => navigate('/login'))}>
          退出登录
        </Button>
      </div>
    </div>
  )
}
