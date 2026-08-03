import request from './request'
import type { Reminder, CreateReminderRequest, ReminderOverview } from '@/types'

// 获取提醒列表
export function getReminderList(params?: { is_sent?: boolean; from?: string; to?: string }) {
  return request.get<Reminder[]>('/reminders', { params })
}

// 创建提醒
export function createReminder(data: CreateReminderRequest & { task_id: number }) {
  return request.post<Reminder>('/reminders', data)
}

// 删除提醒
export function deleteReminder(reminderId: number) {
  return request.delete(`/reminders/${reminderId}`)
}

// 获取今日提醒概览
export function getReminderOverview() {
  return request.get<ReminderOverview>('/reminders/today')
}
