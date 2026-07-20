import request from './request'
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '@/types'

// 获取分类列表
export function getCategoryList() {
  return request.get<Category[]>('/categories')
}

// 创建分类
export function createCategory(data: CreateCategoryRequest) {
  return request.post<Category>('/categories', data)
}

// 更新分类
export function updateCategory(categoryId: number, data: UpdateCategoryRequest) {
  return request.put<Category>(`/categories/${categoryId}`, data)
}

// 删除分类
export function deleteCategory(categoryId: number, moveTo?: number) {
  return request.delete(`/categories/${categoryId}`, {
    params: moveTo !== undefined ? { move_to: moveTo } : undefined
  })
}

// 排序分类
export function reorderCategories(categoryIds: number[]) {
  return request.put('/categories/reorder', { category_ids: categoryIds })
}