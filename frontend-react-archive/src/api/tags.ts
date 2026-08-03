import request from './request'
import type { Tag, CreateTagRequest, UpdateTagRequest } from '@/types'

// 获取标签列表
export function getTagList() {
  return request.get<Tag[]>('/tags')
}

// 创建标签
export function createTag(data: CreateTagRequest) {
  return request.post<Tag>('/tags', data)
}

// 更新标签
export function updateTag(tagId: number, data: UpdateTagRequest) {
  return request.put<Tag>(`/tags/${tagId}`, data)
}

// 删除标签
export function deleteTag(tagId: number) {
  return request.delete(`/tags/${tagId}`)
}
