<script setup lang="ts">
import { ref, computed } from 'vue'

// --- Types ---
interface Email {
  id: number
  subject: string
  sender: string
  senderEmail: string
  senderInitials: string
  to: string
  preview: string
  bodyHtml: string
  tags: { label: string; type: 'priority' | 'internal' }[]
  timestamp: string
  fullTimestamp: string
  unread: boolean
  needsReply: boolean
  selected: boolean
  dimmed: boolean
  attachment?: { name: string; size: string }
}

// --- Mock Data (matching HTML design exactly) ---
const emails = ref<Email[]>([
  {
    id: 1,
    subject: '设计团队 - Q3 规划会议',
    sender: 'Sarah Jenkins',
    senderEmail: 's.jenkins@flow.app',
    senderInitials: 'SJ',
    to: '设计组; 产品组',
    preview: '嗨团队，我们需要在周五前敲定Q3的UI/UX改版计划。请查看附件中的初步线框图并准备反馈。另外，开发资源的分配也需要...',
    bodyHtml: `
      <p class="mb-md">嗨团队，</p>
      <p class="mb-md">希望大家本周工作顺利。</p>
      <p class="mb-md">我们需要在周五前敲定 Q3 的 UI/UX 改版计划。重点将放在提升移动端的任务拖拽体验以及优化深色模式的对比度。</p>
      <p class="mb-md">请查看下方附件中的初步线框图并准备在周四的会议上提供反馈。另外，开发资源的分配也需要在会议上讨论确认。</p>
      <ul class="list-disc pl-xl mb-md space-y-sm text-on-surface-variant">
        <li>审查移动端手势交互设计稿</li>
        <li>确认深色模式色标更新</li>
        <li>评估前端重构工作量</li>
      </ul>
      <p class="mb-xl">谢谢，<br/>Sarah</p>
    `,
    tags: [
      { label: '高优先级', type: 'priority' },
      { label: '内部', type: 'internal' },
    ],
    timestamp: '10:42 AM',
    fullTimestamp: '今天 10:42 AM',
    unread: false,
    needsReply: true,
    selected: true,
    dimmed: false,
    attachment: { name: 'Q3_Design_Wireframes_v2.pdf', size: '4.2 MB' },
  },
  {
    id: 2,
    subject: '客户反馈：全新看板视图',
    sender: 'David Chen',
    senderEmail: 'd.chen@flow.app',
    senderInitials: 'DC',
    to: '产品组',
    preview: '部分早期访问用户报告说，在移动端拖拽卡片时偶有卡顿现象。建议前端团队优先排查手势冲突问题...',
    bodyHtml: `
      <p class="mb-md">嗨，</p>
      <p class="mb-md">部分早期访问用户报告说，在移动端拖拽卡片时偶有卡顿现象。</p>
      <p class="mb-md">建议前端团队优先排查手势冲突问题，尤其是在 iOS Safari 上的表现。以下是具体的用户反馈摘要：</p>
      <ul class="list-disc pl-xl mb-md space-y-sm text-on-surface-variant">
        <li>拖拽过程中页面偶发回弹</li>
        <li>长按触发拖拽的延迟过长</li>
        <li>多指触控时状态混乱</li>
      </ul>
      <p class="mb-xl">Best,<br/>David</p>
    `,
    tags: [],
    timestamp: '昨天',
    fullTimestamp: '昨天 3:28 PM',
    unread: true,
    needsReply: true,
    selected: false,
    dimmed: false,
  },
  {
    id: 3,
    subject: '周报摘要 - 7月第2周',
    sender: 'System Auto-mailer',
    senderEmail: 'noreply@flow.app',
    senderInitials: 'SY',
    to: '全员',
    preview: '这是您本周的任务完成情况汇总。您总共完成了42项任务，效率比上周提升了15%...',
    bodyHtml: `
      <p class="mb-md">你好，</p>
      <p class="mb-md">这是您本周的任务完成情况汇总。</p>
      <p class="mb-md">您总共完成了 42 项任务，效率比上周提升了 15%。参与了 3 个项目讨论，更新了 2 份文档。</p>
      <p class="mb-xl">请在周五前确认并补充关键事项。</p>
    `,
    tags: [],
    timestamp: '周一',
    fullTimestamp: '周一 9:00 AM',
    unread: false,
    needsReply: false,
    selected: false,
    dimmed: true,
  },
  {
    id: 4,
    subject: '关于API接口更新的说明',
    sender: 'Backend Team',
    senderEmail: 'backend@flow.app',
    senderInitials: 'BT',
    to: '前端组; 后端组',
    preview: '请注意，v2.4 API 将于下个月废弃。所有前端调用必须迁移至 v3.0 接口。详情见技术文档仓库...',
    bodyHtml: `
      <p class="mb-md">各位前端同事，</p>
      <p class="mb-md">请注意，v2.4 API 将于下个月废弃。所有前端调用必须迁移至 v3.0 接口。</p>
      <p class="mb-md">主要变更包括：认证流程切换至 OAuth2.0、分页参数格式调整、以及新增批量操作端点。详情见技术文档仓库。</p>
      <p class="mb-xl">请尽快安排迁移工作。</p>
    `,
    tags: [],
    timestamp: '7月8日',
    fullTimestamp: '7月8日 2:15 PM',
    unread: false,
    needsReply: false,
    selected: false,
    dimmed: false,
  },
])

// --- State ---
const selectedEmailId = ref<number>(1)
const searchQuery = ref('')
const activeFilter = ref<'all' | 'unread' | 'needsReply'>('all')
const replyText = ref('')

// --- Filter buttons ---
const filterButtons = [
  { key: 'all' as const, label: '全部' },
  { key: 'unread' as const, label: '未读' },
  { key: 'needsReply' as const, label: '需回复' },
]

// --- Computed ---
const selectedEmail = computed(() => {
  return emails.value.find((e) => e.id === selectedEmailId.value) || null
})

const filteredEmails = computed(() => {
  let list = emails.value
  if (activeFilter.value === 'unread') {
    list = list.filter((e) => e.unread)
  } else if (activeFilter.value === 'needsReply') {
    list = list.filter((e) => e.needsReply)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (e) =>
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.preview.toLowerCase().includes(q),
    )
  }
  return list
})

// --- Methods ---
function selectEmail(id: number) {
  selectedEmailId.value = id
  const email = emails.value.find((e) => e.id === id)
  if (email) email.unread = false
}
</script>

<template>
  <div class="flex-grow flex flex-col h-full bg-background relative overflow-hidden">
    <!-- TopAppBar -->
    <header
      class="flex justify-between items-center w-full px-lg h-16 bg-surface text-primary full-width top-0 z-50 border-b border-surface-variant flex-shrink-0"
    >
      <div class="flex items-center gap-md">
        <h2 class="hidden md:block font-headline text-headline-sm text-on-surface">
          收件箱
        </h2>
      </div>
      <div class="flex-1 max-w-md mx-lg hidden md:block">
        <div class="relative group">
          <span
            class="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors"
            >search</span
          >
          <input
            v-model="searchQuery"
            class="w-full bg-surface-container-low border border-outline-variant rounded-full py-xs pl-xl pr-md text-body-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/60"
            placeholder="搜索邮件..."
            type="text"
          />
        </div>
      </div>
      <div class="flex items-center gap-sm">
        <button
          class="text-on-surface-variant p-sm rounded-full hover:bg-surface-container transition-colors duration-200"
        >
          <span class="material-symbols-outlined">notifications</span>
        </button>
        <button
          class="text-on-surface-variant p-sm rounded-full hover:bg-surface-container transition-colors duration-200"
        >
          <span class="material-symbols-outlined">help_outline</span>
        </button>
        <div
          class="w-8 h-8 rounded-full bg-surface-variant overflow-hidden ml-xs border border-outline-variant shrink-0 cursor-pointer"
        >
          <div
            class="w-full h-full flex items-center justify-center text-label-sm text-on-surface-variant font-bold"
          >
            U
          </div>
        </div>
      </div>
    </header>

    <!-- Split Pane Layout -->
    <div class="flex-grow flex overflow-hidden">
      <!-- Email List Pane (Left) -->
      <div
        class="w-full md:w-[360px] lg:w-[420px] flex-shrink-0 border-r border-surface-variant bg-surface flex flex-col h-full overflow-hidden transition-all duration-300"
      >
        <!-- List Header / Filters -->
        <div
          class="p-md border-b border-surface-variant shrink-0 bg-surface z-10 flex justify-between items-center"
        >
          <div class="flex gap-sm overflow-x-auto no-scrollbar">
            <button
              v-for="filter in filterButtons"
              :key="filter.key"
              :class="[
                'px-sm py-xs rounded-full font-label text-label-sm whitespace-nowrap transition-colors',
                activeFilter === filter.key
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container border border-outline-variant text-on-surface-variant hover:bg-surface-container-high',
              ]"
              @click="activeFilter = filter.key"
            >
              {{ filter.label }}
            </button>
          </div>
        </div>

        <!-- Scrollable List -->
        <div class="flex-grow overflow-y-auto">
          <div
            v-for="email in filteredEmails"
            :key="email.id"
            :class="[
              'p-md border-b border-surface-variant cursor-pointer transition-colors border-l-4',
              selectedEmailId === email.id
                ? 'bg-primary-fixed/10 hover:bg-primary-fixed/20 border-l-primary group'
                : 'bg-surface hover:bg-surface-container-low border-l-transparent',
              email.dimmed ? 'opacity-70' : '',
            ]"
            @click="selectEmail(email.id)"
          >
            <div class="flex justify-between items-start mb-xs">
              <span
                :class="[
                  'font-label text-label-md text-on-surface truncate pr-2',
                  email.unread ? 'font-bold flex items-center gap-xs' : '',
                ]"
              >
                <span
                  v-if="email.unread"
                  class="w-2 h-2 rounded-full bg-primary inline-block"
                ></span>
                {{ email.subject }}
              </span>
              <span
                :class="[
                  'font-label text-label-sm shrink-0',
                  selectedEmailId === email.id
                    ? 'text-primary'
                    : 'text-on-surface-variant',
                ]"
                >{{ email.timestamp }}</span
              >
            </div>
            <p
              :class="[
                'font-body text-body-sm mb-xs truncate',
                email.unread ? 'text-on-surface font-medium' : 'text-on-surface',
              ]"
            >
              {{ email.sender }}
            </p>
            <p class="font-body text-body-sm text-on-surface-variant line-clamp-2">
              {{ email.preview }}
            </p>
            <div v-if="email.tags.length > 0" class="mt-sm flex gap-xs">
              <span
                v-for="tag in email.tags"
                :key="tag.label"
                :class="[
                  'inline-flex items-center px-2 py-0.5 rounded-full font-label text-[10px]',
                  tag.type === 'priority'
                    ? 'bg-error-container text-on-error-container'
                    : 'border border-outline-variant text-on-surface-variant',
                ]"
              >
                {{ tag.label }}
              </span>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-if="filteredEmails.length === 0"
            class="flex flex-col items-center justify-center py-xl text-on-surface-variant"
          >
            <span class="material-symbols-outlined text-4xl mb-sm opacity-40">inbox</span>
            <span class="font-body text-body-sm">没有匹配的邮件</span>
          </div>
        </div>
      </div>

      <!-- Reading Pane (Right) -->
      <div
        v-if="selectedEmail"
        class="hidden md:flex flex-1 bg-background flex-col h-full overflow-hidden relative"
      >
        <!-- Reading Pane Toolbar -->
        <div
          class="h-16 px-lg border-b border-surface-variant flex justify-between items-center bg-surface shrink-0"
        >
          <div class="flex items-center gap-md">
            <button
              class="p-sm rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
              title="归档"
            >
              <span class="material-symbols-outlined">archive</span>
            </button>
            <button
              class="p-sm rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
              title="删除"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
            <button
              class="p-sm rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
              title="标记为未读"
            >
              <span class="material-symbols-outlined">mark_email_unread</span>
            </button>
          </div>
          <div>
            <button
              class="bg-primary hover:bg-primary/90 text-on-primary font-label text-label-md py-sm px-lg rounded-lg flex items-center justify-center gap-sm shadow-sm transition-all group relative overflow-hidden"
            >
              <span
                class="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"
              ></span>
              <span class="material-symbols-outlined text-[18px]">add_task</span>
              转为任务
            </button>
          </div>
        </div>

        <!-- Email Content Area -->
        <div class="flex-grow overflow-y-auto p-lg lg:p-xl bg-surface-container-lowest">
          <!-- Email Header -->
          <div class="mb-xl max-w-3xl mx-auto">
            <h2 class="font-headline text-headline-md text-on-surface mb-md">
              {{ selectedEmail.subject }}
            </h2>
            <div class="flex justify-between items-start">
              <div class="flex items-center gap-md">
                <div
                  class="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline font-bold shrink-0"
                >
                  {{ selectedEmail.senderInitials }}
                </div>
                <div>
                  <p class="font-label text-label-md text-on-surface">
                    {{ selectedEmail.sender }}
                    <span class="text-on-surface-variant font-normal"
                      >&lt;{{ selectedEmail.senderEmail }}&gt;</span
                    >
                  </p>
                  <p class="font-body text-body-sm text-on-surface-variant">
                    发给: {{ selectedEmail.to }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <p class="font-body text-body-sm text-on-surface-variant">
                  {{ selectedEmail.fullTimestamp }}
                </p>
                <button class="text-primary font-label text-label-sm hover:underline mt-xs">
                  查看详情
                </button>
              </div>
            </div>
          </div>

          <!-- Email Body -->
          <div
            class="prose prose-slate max-w-3xl mx-auto font-body text-body-md text-on-surface leading-relaxed"
            v-html="selectedEmail.bodyHtml"
          ></div>

          <!-- Attachments -->
          <div v-if="selectedEmail.attachment" class="max-w-3xl mx-auto">
            <div class="border-t border-surface-variant pt-md mt-xl">
              <h4
                class="font-label text-label-md text-on-surface-variant mb-sm flex items-center gap-xs"
              >
                <span class="material-symbols-outlined text-[18px]">attachment</span>
                附件 (1)
              </h4>
              <div class="flex gap-md">
                <div
                  class="flex items-center gap-sm p-sm border border-outline-variant rounded-lg bg-surface w-64 hover:bg-surface-container-low cursor-pointer transition-colors"
                >
                  <div
                    class="w-10 h-10 bg-error-container text-on-error-container rounded flex items-center justify-center shrink-0"
                  >
                    <span class="material-symbols-outlined">picture_as_pdf</span>
                  </div>
                  <div class="overflow-hidden">
                    <p class="font-label text-label-sm text-on-surface truncate">
                      {{ selectedEmail.attachment.name }}
                    </p>
                    <p class="font-body text-body-sm text-on-surface-variant text-xs">
                      {{ selectedEmail.attachment.size }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Reply Box -->
        <div class="p-lg border-t border-surface-variant bg-surface shrink-0">
          <div class="max-w-3xl mx-auto flex gap-md items-start">
            <div
              class="w-8 h-8 rounded-full bg-surface-variant overflow-hidden border border-outline-variant shrink-0 mt-xs"
            >
              <div
                class="w-full h-full flex items-center justify-center text-label-sm text-on-surface-variant font-bold"
              >
                U
              </div>
            </div>
            <div
              class="flex-grow bg-surface-container-low border border-outline-variant rounded-lg focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all overflow-hidden"
            >
              <textarea
                v-model="replyText"
                class="w-full bg-transparent border-none focus:ring-0 resize-none p-md font-body text-body-sm text-on-surface"
                :placeholder="`快捷回复 ${selectedEmail.sender}...`"
                rows="3"
              ></textarea>
              <div class="px-md py-sm flex justify-between items-center bg-surface-container">
                <div class="flex gap-sm">
                  <button
                    class="text-on-surface-variant hover:text-primary transition-colors p-xs rounded"
                  >
                    <span class="material-symbols-outlined text-[20px]">format_bold</span>
                  </button>
                  <button
                    class="text-on-surface-variant hover:text-primary transition-colors p-xs rounded"
                  >
                    <span class="material-symbols-outlined text-[20px]">format_italic</span>
                  </button>
                  <button
                    class="text-on-surface-variant hover:text-primary transition-colors p-xs rounded"
                  >
                    <span class="material-symbols-outlined text-[20px]">link</span>
                  </button>
                </div>
                <button
                  class="bg-primary hover:bg-primary/90 text-on-primary font-label text-label-sm py-xs px-md rounded flex items-center gap-xs shadow-sm transition-all"
                >
                  <span class="material-symbols-outlined text-[16px]">send</span>
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty Reading Pane -->
      <div
        v-if="!selectedEmail"
        class="hidden md:flex flex-1 bg-surface-container-lowest flex-col items-center justify-center"
      >
        <span class="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-md"
          >mail</span
        >
        <p class="font-body text-body-md text-on-surface-variant/60">选择一封邮件开始阅读</p>
      </div>
    </div>
  </div>
</template>
