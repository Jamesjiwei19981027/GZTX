<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

// --- Types ---
interface KanbanCard {
  id: number
  tag: string
  tagClass: string
  title: string
  priorityLabel: string
  priorityClass: string
  priorityIcon: string
  assignees: string[]
  progress?: number
  completed?: boolean
  completedDate?: string
}

interface KanbanColumn {
  id: string
  title: string
  count: number
  countClass: string
  icon: string
  cards: KanbanCard[]
}

// --- Mock Data (matching HTML design exactly) ---
const columns = ref<KanbanColumn[]>([
  {
    id: 'todo',
    title: '待办',
    count: 4,
    countClass: 'bg-surface-container-highest text-on-surface-variant',
    icon: 'add',
    cards: [
      {
        id: 1,
        tag: '技术调研',
        tagClass: 'bg-primary-fixed/20 text-primary',
        title: '设计新版用户权限模型文档',
        priorityLabel: '高',
        priorityClass: 'text-error',
        priorityIcon: 'priority_high',
        assignees: ['张'],
      },
      {
        id: 2,
        tag: 'UI设计',
        tagClass: 'bg-secondary-container/30 text-secondary',
        title: '完成移动端详情页高保真原型',
        priorityLabel: '中',
        priorityClass: 'text-tertiary',
        priorityIcon: 'low_priority',
        assignees: ['李'],
      },
      {
        id: 3,
        tag: '技术调研',
        tagClass: 'bg-primary-fixed/20 text-primary',
        title: '评估 WebSocket 与 SSE 方案选型',
        priorityLabel: '低',
        priorityClass: 'text-on-surface-variant',
        priorityIcon: 'low_priority',
        assignees: ['王'],
      },
      {
        id: 4,
        tag: '文档',
        tagClass: 'bg-surface-container-highest text-on-surface-variant',
        title: '编写 v3.0 迁移指南',
        priorityLabel: '中',
        priorityClass: 'text-tertiary',
        priorityIcon: 'low_priority',
        assignees: ['赵'],
      },
    ],
  },
  {
    id: 'in-progress',
    title: '进行中',
    count: 2,
    countClass: 'bg-primary-container text-on-primary-container',
    icon: 'more_horiz',
    cards: [
      {
        id: 5,
        tag: '后端开发',
        tagClass: 'bg-tertiary-fixed text-tertiary',
        title: '重构API认证层并对接OAuth2.0',
        priorityLabel: '急',
        priorityClass: 'text-error',
        priorityIcon: 'priority_high',
        assignees: ['王', '赵'],
        progress: 66,
      },
      {
        id: 6,
        tag: 'UI设计',
        tagClass: 'bg-secondary-container/30 text-secondary',
        title: '优化深色模式色彩对比度',
        priorityLabel: '高',
        priorityClass: 'text-error',
        priorityIcon: 'priority_high',
        assignees: ['李'],
        progress: 40,
      },
    ],
  },
  {
    id: 'done',
    title: '已完成',
    count: 12,
    countClass: 'bg-secondary-fixed-dim text-on-secondary-fixed',
    icon: 'check_circle',
    cards: [
      {
        id: 7,
        tag: '文档',
        tagClass: 'bg-surface-container-highest text-on-surface-variant',
        title: '第二季度项目回顾报告',
        priorityLabel: '',
        priorityClass: '',
        priorityIcon: '',
        assignees: ['张'],
        completed: true,
        completedDate: '昨日',
      },
      {
        id: 8,
        tag: '后端开发',
        tagClass: 'bg-surface-container-highest text-on-surface-variant',
        title: '修复用户头像上传裁剪异常',
        priorityLabel: '',
        priorityClass: '',
        priorityIcon: '',
        assignees: ['王'],
        completed: true,
        completedDate: '2天前',
      },
      {
        id: 9,
        tag: '技术调研',
        tagClass: 'bg-surface-container-highest text-on-surface-variant',
        title: '调研前端状态管理方案',
        priorityLabel: '',
        priorityClass: '',
        priorityIcon: '',
        assignees: ['赵'],
        completed: true,
        completedDate: '3天前',
      },
    ],
  },
])

// --- Refs ---
const boardRef = ref<HTMLElement | null>(null)

// --- Lifecycle ---
onMounted(() => {
  nextTick(() => {
    if (!boardRef.value) return
    const cards = boardRef.value.querySelectorAll('.kanban-card')
    cards.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        if (!card.classList.contains('opacity-60')) {
          ;(card as HTMLElement).style.transform = 'translateY(-2px)'
        }
      })
      card.addEventListener('mouseleave', () => {
        ;(card as HTMLElement).style.transform = 'translateY(0)'
      })
    })
  })
})
</script>

<template>
  <main class="p-lg h-full overflow-hidden flex flex-col">
    <!-- Board Header -->
    <div class="flex justify-between items-center mb-lg">
      <div>
        <h1 class="font-display text-display-lg text-on-surface">研发协作看板</h1>
        <div
          class="flex items-center gap-md mt-xs text-on-surface-variant font-body text-body-sm"
        >
          <span class="flex items-center gap-xs"
            ><span class="w-2 h-2 rounded-full bg-secondary"></span> 正常运行</span
          >
          <span>&bull;</span>
          <span>最后更新于 2分钟前</span>
        </div>
      </div>
      <div class="flex items-center gap-sm">
        <div class="flex -space-x-3 mr-md">
          <div
            class="w-8 h-8 rounded-full border-2 border-surface bg-primary-container text-on-primary-container flex items-center justify-center text-label-sm font-bold"
          >
            张
          </div>
          <div
            class="w-8 h-8 rounded-full border-2 border-surface bg-secondary-container text-on-secondary-container flex items-center justify-center text-label-sm font-bold"
          >
            李
          </div>
          <div
            class="w-8 h-8 rounded-full border-2 border-surface bg-tertiary-container text-on-tertiary-container flex items-center justify-center text-label-sm font-bold"
          >
            王
          </div>
          <div
            class="w-8 h-8 rounded-full border-2 border-white bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
          >
            +5
          </div>
        </div>
        <button
          class="px-md py-xs rounded-lg border border-outline hover:bg-surface-container transition-colors text-label-md font-label flex items-center gap-xs"
        >
          <span class="material-symbols-outlined" style="font-size: 18px">filter_list</span>
          筛选
        </button>
      </div>
    </div>

    <!-- Kanban Board -->
    <div ref="boardRef" class="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar pb-lg">
      <div class="flex gap-lg min-w-[1000px] h-full">
        <!-- Column -->
        <div
          v-for="column in columns"
          :key="column.id"
          :class="[
            'flex-1 min-w-[320px] bg-surface-container-low rounded-2xl p-md flex flex-col gap-md',
            column.id === 'done' ? 'opacity-80' : '',
          ]"
        >
          <!-- Column Header -->
          <div class="flex justify-between items-center px-sm">
            <div class="flex items-center gap-sm">
              <h3 class="font-headline text-headline-sm text-on-surface">
                {{ column.title }}
              </h3>
              <span
                :class="[
                  'px-sm py-[2px] rounded text-label-sm font-label',
                  column.countClass,
                ]"
                >{{ column.count }}</span
              >
            </div>
            <button class="text-on-surface-variant hover:text-primary transition-colors">
              <span class="material-symbols-outlined">{{ column.icon }}</span>
            </button>
          </div>

          <!-- Cards Container -->
          <div class="flex flex-col gap-md overflow-y-auto custom-scrollbar pr-sm h-full pb-md">
            <!-- Card -->
            <div
              v-for="card in column.cards"
              :key="card.id"
              :class="[
                'kanban-card bg-surface p-md rounded-xl shadow-[0px_2px_4px_rgba(0,0,0,0.05)] transition-all',
                card.completed
                  ? 'border border-surface-variant opacity-60'
                  : column.id === 'in-progress'
                    ? 'border border-primary-container/30 hover:shadow-[0px_10px_15px_rgba(0,0,0,0.1)] cursor-grab group'
                    : 'border border-surface-variant hover:shadow-[0px_10px_15px_rgba(0,0,0,0.1)] cursor-grab active:cursor-grabbing group',
              ]"
            >
              <!-- Card Header: Tag + Drag/Check -->
              <div class="flex justify-between items-start mb-sm">
                <span
                  :class="[
                    'px-sm py-[2px] rounded-full font-label text-label-sm',
                    card.tagClass,
                  ]"
                  >{{ card.tag }}</span
                >
                <span
                  v-if="card.completed"
                  class="material-symbols-outlined text-secondary"
                  style="font-variation-settings: 'FILL' 1"
                  >check_circle</span
                >
                <span
                  v-else
                  class="material-symbols-outlined text-outline-variant group-hover:text-on-surface-variant"
                  >drag_indicator</span
                >
              </div>

              <!-- Card Title -->
              <h4
                :class="[
                  'font-label text-label-md text-on-surface mb-md',
                  card.completed ? 'line-through decoration-on-surface-variant' : '',
                ]"
              >
                {{ card.title }}
              </h4>

              <!-- Progress Bar (in-progress cards only) -->
              <div
                v-if="card.progress !== undefined"
                class="w-full bg-surface-container h-1 rounded-full mb-md overflow-hidden"
              >
                <div class="bg-primary h-full" :style="{ width: card.progress + '%' }"></div>
              </div>

              <!-- Card Footer -->
              <div class="flex justify-between items-center">
                <!-- Priority or Completed Date -->
                <div
                  v-if="card.completed"
                  class="text-on-surface-variant font-label text-label-sm"
                >
                  完成于 {{ card.completedDate }}
                </div>
                <div
                  v-else
                  :class="[
                    'flex items-center gap-xs font-label text-label-sm',
                    card.priorityClass,
                  ]"
                >
                  <span class="material-symbols-outlined" style="font-size: 16px">{{
                    card.priorityIcon
                  }}</span>
                  {{ card.priorityLabel }}
                </div>

                <!-- Assignee(s) -->
                <div :class="card.assignees.length > 1 ? 'flex -space-x-2' : ''">
                  <div
                    v-for="(assignee, idx) in card.assignees"
                    :key="idx"
                    :class="[
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                      card.assignees.length > 1 ? 'border border-surface' : '',
                      idx === 0
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-tertiary-container text-on-tertiary-container',
                    ]"
                  >
                    {{ assignee }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e1e3e4;
  border-radius: 10px;
}
</style>
