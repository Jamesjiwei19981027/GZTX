import { useEffect, useState } from 'react'
import { Form, Input, Select, DatePicker, Button, Tag } from 'antd'
import { message } from '@/utils/antdMessage'
import dayjs, { type Dayjs } from 'dayjs'
import type { Task, CreateTaskRequest, TaskPriority, Tag as TagType, Category } from '@/types'
import { getTagList, createTag } from '@/api/tags'
import { getCategoryList } from '@/api/categories'
import { getErrorMessage } from '@/api/request'

type TaskFormProps = {
  task?: Task | null
  onSubmit: (data: CreateTaskRequest) => void | Promise<void>
  onCancel: () => void
  submitting?: boolean
}

type FormValues = {
  title: string
  description?: string
  priority: TaskPriority
  category_id?: number
  tag_ids?: number[]
  due_date?: Dayjs | null
}

const priorityOptions = [
  { value: 0 as TaskPriority, label: '低', color: '#006c49' },
  { value: 1 as TaskPriority, label: '中', color: '#924700' },
  { value: 2 as TaskPriority, label: '高', color: '#ba1a1a' },
]

export default function TaskForm({ task, onSubmit, onCancel, submitting }: TaskFormProps) {
  const [form] = Form.useForm<FormValues>()
  const [tags, setTags] = useState<TagType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const isEdit = !!task

  useEffect(() => {
    void (async () => {
      try {
        const [tagList, catList] = await Promise.all([getTagList(), getCategoryList()])
        setTags(tagList ?? [])
        setCategories(catList ?? [])
      } catch {
        /* interceptor */
      }
    })()
  }, [])

  useEffect(() => {
    if (task) {
      form.setFieldsValue({
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        category_id: task.category?.id,
        tag_ids: task.tags?.map((t) => t.id) ?? [],
        due_date: task.due_date ? dayjs(task.due_date) : null,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ priority: 1, tag_ids: [] })
    }
  }, [task, form])

  async function handleFinish(values: FormValues) {
    const data: CreateTaskRequest = {
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      priority: values.priority,
      category_id: values.category_id,
      tag_ids: values.tag_ids?.length ? values.tag_ids : undefined,
      due_date: values.due_date ? values.due_date.format('YYYY-MM-DDTHH:mm:ss') : undefined,
    }
    await onSubmit(data)
  }

  async function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) return
    setCreatingTag(true)
    try {
      const created = await createTag({ name, color: '#0058be' })
      setTags((prev) => [...prev, created])
      const current = form.getFieldValue('tag_ids') as number[] | undefined
      form.setFieldValue('tag_ids', [...(current || []), created.id])
      setNewTagName('')
      message.success('标签已创建')
    } catch (err) {
      message.error(getErrorMessage(err, '创建标签失败'))
    } finally {
      setCreatingTag(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-surface-variant overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-variant bg-surface-container-low">
        <span className="material-symbols-outlined text-primary text-2xl">
          {isEdit ? 'edit_note' : 'add_task'}
        </span>
        <h3 className="text-lg font-semibold text-on-surface m-0">
          {isEdit ? '编辑任务' : '新建任务'}
        </h3>
      </div>

      <div className="p-6">
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => void handleFinish(v)}
          initialValues={{ priority: 1, tag_ids: [] }}
        >
          <Form.Item
            label="任务标题"
            name="title"
            rules={[
              { required: true, message: '请输入任务标题' },
              { max: 100, message: '标题最多 100 个字符' },
            ]}
          >
            <Input placeholder="请输入任务标题" maxLength={100} showCount />
          </Form.Item>

          <Form.Item label="任务描述" name="description">
            <Input.TextArea
              placeholder="请输入任务描述（可选）"
              maxLength={500}
              showCount
              rows={3}
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item label="优先级" name="priority">
              <Select
                options={priorityOptions.map((o) => ({
                  value: o.value,
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                      {o.label}
                    </span>
                  ),
                }))}
              />
            </Form.Item>

            <Form.Item label="分类" name="category_id">
              <Select
                allowClear
                placeholder="选择分类"
                options={categories.map((c) => ({
                  value: c.id,
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  ),
                }))}
              />
            </Form.Item>
          </div>

          <Form.Item label="截止日期" name="due_date">
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              className="w-full"
              placeholder="选择截止日期"
            />
          </Form.Item>

          <Form.Item label="标签" name="tag_ids">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择标签"
              optionFilterProp="label"
              options={tags.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
              optionRender={(opt) => {
                const tag = tags.find((t) => t.id === opt.value)
                return (
                  <span className="inline-flex items-center gap-2">
                    {tag && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                    )}
                    {opt.label}
                  </span>
                )
              }}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <div className="p-2 border-t border-surface-variant flex gap-2">
                    <Input
                      size="small"
                      placeholder="新标签名"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onPressEnter={() => void handleCreateTag()}
                    />
                    <Button size="small" type="link" loading={creatingTag} onClick={() => void handleCreateTag()}>
                      新建
                    </Button>
                  </div>
                </>
              )}
            />
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {() => {
              const ids = (form.getFieldValue('tag_ids') as number[] | undefined) || []
              if (!ids.length) return null
              return (
                <div className="flex flex-wrap gap-2 mb-4 -mt-2">
                  {ids.map((id) => {
                    const tag = tags.find((t) => t.id === id)
                    if (!tag) return null
                    return (
                      <Tag
                        key={id}
                        color={tag.color}
                        closable
                        onClose={() =>
                          form.setFieldValue(
                            'tag_ids',
                            ids.filter((x) => x !== id),
                          )
                        }
                      >
                        {tag.name}
                      </Tag>
                    )
                  })}
                </div>
              )
            }}
          </Form.Item>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-variant">
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {isEdit ? '保存修改' : '创建任务'}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  )
}
