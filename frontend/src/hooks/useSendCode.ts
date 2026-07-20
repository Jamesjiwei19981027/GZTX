import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { getErrorMessage } from '@/api/request'
import type { SendCodeResult } from '@/types'

/** 发送验证码 + 倒计时。sender 由调用方注入（注册用匿名接口，补验用登录态接口）。 */
export function useSendCode(sender: (target: string) => Promise<SendCodeResult | null>) {
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function startCountdown(seconds: number) {
    setCountdown(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1 && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        return Math.max(0, s - 1)
      })
    }, 1000)
  }

  async function send(target: string): Promise<boolean> {
    if (!target) {
      message.warning('请先填写接收验证码的邮箱/手机号')
      return false
    }
    setSending(true)
    try {
      const result = await sender(target)
      startCountdown(result?.resend_after ?? 60)
      if (result?.debug_code) {
        // 仅后端 DEBUG 模式返回，便于联调
        message.info(`开发模式验证码：${result.debug_code}`, 8)
      } else {
        message.success('验证码已发送')
      }
      return true
    } catch (err) {
      message.error(getErrorMessage(err, '验证码发送失败'))
      return false
    } finally {
      setSending(false)
    }
  }

  return { send, sending, countdown }
}
