import { useEffect, useState } from 'react'
import { Modal, Slider, Input, Checkbox, DatePicker, Select, Space, Button } from 'antd'
import type { Dayjs } from 'dayjs'
import type { TaskCompleteRequest } from '@/types'

type TaskCompleteDialogProps = {
  open: boolean
  taskTitle?: string
  onClose: () => void
  onSubmit: (data: TaskCompleteRequest) => void | Promise<void>
  loading?: boolean
}

const followUpReasonOptions = [
  '任务部分完成，需继续推进',
  '等待他人反馈或确认',
  '需要后续验证结果',
  '存在待解决的依赖问题',
  '需要补充相关材料',
  '需要再次沟通确认',
  '其他',
]

const channelOptions = [
  { value: 'web_popup', label: '网页弹窗' },
  { value: 'email', label: '邮件提醒' },
  { value: 'wechat', label: '微信提醒' },
  { value: 'sms', label: '短信提醒' },
  { value: 'alarm', label: '闹钟提醒' },
]

export default function TaskCompleteDialog({
  open,
  taskTitle,
  onClose,
  onSubmit,
  loading,
}: TaskCompleteDialogProps) {
  const [completionRate, setCompletionRate] = useState(100)
  const [comment, setComment] = useState('')
  const [needsFollowUp, setNeedsFollowUp] = useState(false)
  const [followUpReason, setFollowUpReason] = useState<string>()
  const [followUpReasonCustom, setFollowUpReasonCustom] = useState('')
  const [followUpRemindAt, setFollowUpRemindAt] = useState<Dayjs | null>(null)
  const [channels, setChannels] = useState<string[]>(['web_popup'])

  useEffect(() => {
    if (open) {
      setCompletionRate(100)
      setComment('')
      setNeedsFollowUp(false)
      setFollowUpReason(undefined)
      setFollowUpReasonCustom('')
      setFollowUpRemindAt(null)
      setChannels(['web_popup'])
    }
  }, [open])

  async function handleOk() {
    const data: TaskCompleteRequest = {
      completion_rate: completionRate,
      completion_comment: comment || undefined,
      needs_follow_up: needsFollowUp,
    }
    if (needsFollowUp) {
      data.follow_up_reason =
        followUpReason === '其他' ? followUpReasonCustom || undefined : followUpReason || undefined
      if (followUpRemindAt) {
        data.follow_up_remind_at = followUpRemindAt.format('YYYY-MM-DDTHH:mm:ss')
      }
      if (channels.length) {
        data.follow_up_notify_channels = channels.join(',')
      }
    }
    await onSubmit(data)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-green-600">task_alt</span>
            <span>完成任务评价</span>
          </div>
          {taskTitle && <p className="text-sm text-gray-500 font-normal mt-1 m-0 truncate">{taskTitle}</p>}
        </div>
      }
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => void handleOk()}>
            确认完成
          </Button>
        </Space>
      }
      destroyOnHidden
      width={560}
    >
      <div className="space-y-5 py-2">
        <div>
          <div className="mb-2 text-sm text-gray-600">完成度：{completionRate}%</div>
          <Slider
            min={0}
            max={100}
            step={5}
            marks={{ 0: '0%', 50: '50%', 100: '100%' }}
            value={completionRate}
            onChange={setCompletionRate}
          />
        </div>

        <div>
          <div className="mb-2 text-sm text-gray-600">完成备注</div>
          <Input.TextArea
            rows={3}
            placeholder="可选：记录完成情况"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
          />
        </div>

        <Checkbox checked={needsFollowUp} onChange={(e) => setNeedsFollowUp(e.target.checked)}>
          需要跟进
        </Checkbox>

        {needsFollowUp && (
          <div className="space-y-3 pl-1 border-l-2 border-amber-300 ml-1">
            <div>
              <div className="mb-1 text-sm text-gray-600">跟进原因</div>
              <Select
                className="w-full"
                placeholder="选择原因"
                value={followUpReason}
                onChange={setFollowUpReason}
                options={followUpReasonOptions.map((r) => ({ value: r, label: r }))}
              />
              {followUpReason === '其他' && (
                <Input
                  className="mt-2"
                  placeholder="请输入自定义原因"
                  value={followUpReasonCustom}
                  onChange={(e) => setFollowUpReasonCustom(e.target.value)}
                />
              )}
            </div>
            <div>
              <div className="mb-1 text-sm text-gray-600">跟进提醒时间</div>
              <DatePicker
                showTime
                className="w-full"
                format="YYYY-MM-DD HH:mm"
                value={followUpRemindAt}
                onChange={setFollowUpRemindAt}
              />
            </div>
            <div>
              <div className="mb-1 text-sm text-gray-600">通知方式</div>
              <Select
                mode="multiple"
                className="w-full"
                value={channels}
                onChange={setChannels}
                options={channelOptions}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
