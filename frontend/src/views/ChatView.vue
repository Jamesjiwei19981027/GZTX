<script setup lang="ts">
import { ref } from 'vue'

interface ChatItem {
  id: number
  name: string
  avatar: string
  avatarType: 'image' | 'icon'
  icon?: string
  isGroup: boolean
  preview: string
  timestamp: string
  online: boolean
  category: 'group' | 'dm'
}

interface Message {
  id: number
  type: 'received' | 'sent' | 'system'
  senderName?: string
  avatar?: string
  content: string
  timestamp?: string
  file?: { name: string; size: string; icon: string; iconBg: string; iconColor: string }
  systemIcon?: string
}

interface SharedFile {
  id: number
  name: string
  icon: string
  iconBg: string
  iconColor: string
  sharedBy: string
  date: string
}

interface PinnedLink {
  title: string
}

const activeChatId = ref(1)
const activeTab = ref<'files' | 'tasks' | 'about'>('files')
const messageText = ref('')

const chatList: ChatItem[] = [
  {
    id: 1,
    name: '产品设计组',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDfqLguMR30SduMxCJvwKOGXKeU1Zz8npBsftHDoEk6jvybg780MLHTwqh1NfGklZZtucrgtVUD3eixM-ApVwFX72-bqr3tGdN4ej-P-es1u6kZCTSjWpljIkqJftNKn7NSyaXeRnT3zE0KnHrXyKRsd2bmPXUxynyBewvJ9B93npDSmvUgk5M1ttAndWC6j5Cjg7VLGiUTL6gVx3pcnUGEHgttw2X_NumleumVC5gy4Zhc2ieJmTgA3bgIhWo1hb_iVFsnIqxcPMs',
    avatarType: 'image',
    isGroup: true,
    preview: 'Sarah: 我们需要更新一下登录页的视觉稿...',
    timestamp: '10:42 AM',
    online: true,
    category: 'group',
  },
  {
    id: 2,
    name: '全员通知',
    avatar: '',
    avatarType: 'icon',
    icon: 'campaign',
    isGroup: true,
    preview: '本周五下午有系统维护...',
    timestamp: '昨天',
    online: false,
    category: 'group',
  },
  {
    id: 3,
    name: 'Alex Chen',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB5wWtQ_w7KdMxfWHcHeg00FR_VDwT4P6tJLMndnUwN3BB9xrtjaaxOrOUG_QpQ7oKVPAfF6-2jXQPpg7aoQmJtWQUv7uu4QbLr5Nu76NtvPOnThwxSyWJs9OnPOYYDLX4RvWaXI_uKwZuyo6frUbKdiEnPtDig6Gv1cZhIr1CXncm2NsvgdwwYgNWBPEbiyrILdjHpWhS0GIxwjdj3n_qZZR7EjKB9nBtITmBhCScleKa6eqtKZEeFFfpOUhvZ7K1dNzbHCC6-DE8',
    avatarType: 'image',
    isGroup: false,
    preview: '好的，文件我已经查收了。',
    timestamp: '周二',
    online: true,
    category: 'dm',
  },
]

const messages: Message[] = [
  {
    id: 1,
    type: 'system',
    content: '今天, 9:00 AM',
  },
  {
    id: 2,
    type: 'received',
    senderName: 'Alex Chen',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBPJ995hcAM9uleO2fK9ARq3WDytY0zceFBEfPL79b3sRB2J7ES4vlOKyTx6JvrAgFUfGMFTuTSoFP9JokECOF7YCyXUDirCUaVXk0hlY37HYmRiQeNcHaDjdNz4NYnEUPmwaX-iNyoek_j-MUfFr3wCFM71RDO7PajsIyw8ch4ugbU1_h3K4T6GIHW1AzzH92lTiewXCQZTX_0gJtJdWysoidqMhcyQXE6HYXjYSmS3mWH08v5PADDdcjbngmelooX1HAMe7344Io',
    content: '大家早上好！我刚把昨天讨论的首页重构方案上传到文件区了，请查收。',
    timestamp: '9:05 AM',
    file: {
      name: '首页重构方案_v2.pdf',
      size: '2.4 MB',
      icon: 'description',
      iconBg: 'bg-primary-fixed/30',
      iconColor: 'text-primary',
    },
  },
  {
    id: 3,
    type: 'sent',
    content: '收到，我大概看了一下，整体逻辑清晰很多。不过关于导航栏的交互我们可能还需要再讨论一下。',
    timestamp: '10:42 AM',
  },
  {
    id: 4,
    type: 'sent',
    content: '下午两点开个简短的碰头会？',
    timestamp: '10:42 AM',
  },
  {
    id: 5,
    type: 'system',
    content: 'Alex Chen 完成了任务 "准备视觉资产"',
    systemIcon: 'task_alt',
  },
]

const sharedFiles: SharedFile[] = [
  {
    id: 1,
    name: '首页重构方案_v2.pdf',
    icon: 'picture_as_pdf',
    iconBg: 'bg-error-container',
    iconColor: 'text-on-error-container',
    sharedBy: 'Alex',
    date: '今天',
  },
  {
    id: 2,
    name: 'Hero_Section_Mockup.png',
    icon: 'image',
    iconBg: 'bg-primary-fixed/50',
    iconColor: 'text-primary-container',
    sharedBy: 'Sarah',
    date: '昨天',
  },
]

const pinnedLinks: PinnedLink[] = [
  { title: 'Figma 设计源文件' },
  { title: '项目进度甘特图' },
]

const tabs = [
  { key: 'files' as const, label: '文件' },
  { key: 'tasks' as const, label: '任务' },
  { key: 'about' as const, label: '关于' },
]

const groupChats = chatList.filter(c => c.category === 'group')
const dmChats = chatList.filter(c => c.category === 'dm')

function selectChat(id: number) {
  activeChatId.value = id
}

function sendMessage() {
  if (!messageText.value.trim()) return
  messageText.value = ''
}
</script>

<template>
  <div class="flex-1 flex h-full bg-surface-container-lowest overflow-hidden">
    <!-- Left Panel: Chat List -->
    <aside class="w-[320px] border-r border-outline-variant bg-surface-container-lowest flex flex-col h-full flex-shrink-0">
      <!-- Header & Search -->
      <div class="p-lg border-b border-surface-variant">
        <div class="flex items-center justify-between mb-md">
          <h2 class="font-headline text-headline-sm text-on-surface">团队沟通</h2>
          <button class="text-on-surface-variant hover:text-primary transition-colors">
            <span class="material-symbols-outlined">edit_square</span>
          </button>
        </div>
        <div class="relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style="font-size: 20px;">search</span>
          <input
            type="text"
            placeholder="搜索聊天记录"
            class="w-full bg-surface-container pl-10 pr-4 py-2 rounded-lg border border-transparent focus:border-primary focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary font-body text-body-sm text-on-surface placeholder-on-surface-variant transition-all outline-none"
          />
        </div>
      </div>

      <!-- Chat List Scrollable -->
      <div class="flex-1 overflow-y-auto p-sm">
        <!-- Group Category -->
        <div class="px-md py-sm flex items-center justify-between group cursor-pointer">
          <span class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">群组</span>
          <span class="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" style="font-size: 16px;">add</span>
        </div>

        <!-- Group Chat Items -->
        <template v-for="chat in groupChats" :key="chat.id">
          <div
            :class="[
              'flex items-center gap-md p-md rounded-xl cursor-pointer relative',
              activeChatId === chat.id
                ? 'bg-primary-fixed/30'
                : 'hover:bg-surface-container-low transition-colors mt-sm'
            ]"
            @click="selectChat(chat.id)"
          >
            <!-- Active indicator bar -->
            <div
              v-if="activeChatId === chat.id"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"
            />
            <!-- Image avatar -->
            <div v-if="chat.avatarType === 'image'" class="relative w-12 h-12 flex-shrink-0">
              <img
                :src="chat.avatar"
                :alt="chat.name"
                class="w-full h-full rounded-lg object-cover shadow-sm"
              />
              <div
                v-if="chat.online"
                class="absolute -bottom-1 -right-1 w-4 h-4 bg-secondary-fixed-dim rounded-full border-2 border-surface-container-lowest"
              />
            </div>
            <!-- Icon avatar -->
            <div
              v-else
              class="relative w-12 h-12 flex-shrink-0 bg-surface-container-high rounded-lg flex items-center justify-center text-on-surface-variant"
            >
              <span class="material-symbols-outlined">{{ chat.icon }}</span>
            </div>
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-xs">
                <span class="font-label text-label-md text-on-surface truncate">{{ chat.name }}</span>
                <span class="font-label text-label-sm text-on-surface-variant">{{ chat.timestamp }}</span>
              </div>
              <p class="font-body text-body-sm text-on-surface-variant truncate">{{ chat.preview }}</p>
            </div>
          </div>
        </template>

        <!-- DM Category -->
        <div class="px-md py-sm mt-lg flex items-center justify-between group cursor-pointer">
          <span class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">直接消息</span>
          <span class="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" style="font-size: 16px;">add</span>
        </div>

        <!-- DM Chat Items -->
        <template v-for="chat in dmChats" :key="chat.id">
          <div
            :class="[
              'flex items-center gap-md p-md rounded-xl cursor-pointer relative',
              activeChatId === chat.id
                ? 'bg-primary-fixed/30'
                : 'hover:bg-surface-container-low transition-colors'
            ]"
            @click="selectChat(chat.id)"
          >
            <!-- Active indicator bar -->
            <div
              v-if="activeChatId === chat.id"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"
            />
            <!-- Avatar -->
            <div class="relative w-12 h-12 flex-shrink-0">
              <img
                :src="chat.avatar"
                :alt="chat.name"
                class="w-full h-full rounded-full object-cover shadow-sm"
              />
              <div
                v-if="chat.online"
                class="absolute -bottom-1 -right-1 w-4 h-4 bg-secondary-fixed-dim rounded-full border-2 border-surface-container-lowest"
              />
            </div>
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-xs">
                <span class="font-label text-label-md text-on-surface truncate">{{ chat.name }}</span>
                <span class="font-label text-label-sm text-on-surface-variant">{{ chat.timestamp }}</span>
              </div>
              <p class="font-body text-body-sm text-on-surface-variant truncate">{{ chat.preview }}</p>
            </div>
          </div>
        </template>
      </div>
    </aside>

    <!-- Center Panel: Conversation -->
    <section class="flex-1 flex flex-col min-w-0 bg-surface">
      <!-- Chat Header -->
      <header class="h-20 px-lg border-b border-outline-variant bg-surface/80 backdrop-blur-md flex items-center justify-between flex-shrink-0 z-10 sticky top-0">
        <div class="flex items-center gap-md">
          <!-- Avatar Stack -->
          <div class="flex -space-x-3">
            <img
              alt="Avatar 1"
              class="w-10 h-10 rounded-full border-2 border-surface object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBi5WvJWxASfoQ5aIg-t2nJn-I6KoBXLtsPrV4jhNkEKGL5NOoAmdBBUG5yVYv1lPmYcJxDAhz1mGCXm--kG3HYWHODYEUE3ornV3WfZV5Cbe_2ldnj4czTtRDToU3JTH2Z-WwTB4KD9kmj6l1D5feINt2M7-8jmmuRDSTM1zGIS51L0PhIA8mMBnFa_GD77dylQgOYmMSSke2exwWzH6NOZWxGu4Ovc7cgS9T1y5t6PWyJpGQ3Ztf2UhwOcBi55qo1SmYJDcpa2eA"
            />
            <img
              alt="Avatar 2"
              class="w-10 h-10 rounded-full border-2 border-surface object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuChJWpuGIKaZ0wb6iGe3XXY3cQOa4G_wwcEGNZD-t_sAXnivm-mXSc7kNhECMj7iZSx6byWgSAWGTuWncG0jkhwr5AnYQmhtPOJtjZiXn4bAAySVODk6RUTEboPOr7H8X3HlNK9rH39ij4D_ZksrDyw3Tq0jrZ7GPRDGfXjdWlOfL1Kv7OydnHZrIfFmmc9DFCt-PtdAfiwxg3yvZ5UghfmiT3o6ETMDiwcV9YAjncjJL5dHnbdpm7qU_0Cim7ZzAqqAoKVH1YGlqw"
            />
            <div class="w-10 h-10 rounded-full border-2 border-surface bg-surface-container-high flex items-center justify-center font-label text-on-surface-variant">+4</div>
          </div>
          <div>
            <h2 class="font-headline text-headline-sm text-on-surface flex items-center gap-2">
              产品设计组
              <span class="material-symbols-outlined text-outline" style="font-size: 18px;">lock</span>
            </h2>
            <p class="font-body text-body-sm text-on-surface-variant">6 位成员在线</p>
          </div>
        </div>
        <div class="flex items-center gap-sm">
          <button class="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span class="material-symbols-outlined">call</span>
          </button>
          <button class="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span class="material-symbols-outlined">videocam</span>
          </button>
          <div class="w-[1px] h-6 bg-outline-variant mx-2" />
          <button class="p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        </div>
      </header>

      <!-- Messages Area -->
      <div class="flex-1 overflow-y-auto p-lg flex flex-col gap-lg">
        <template v-for="msg in messages" :key="msg.id">
          <!-- Date / System Divider -->
          <div v-if="msg.type === 'system'" class="flex justify-center my-md">
            <span class="px-md py-1 rounded-full bg-surface-container-low font-label text-label-sm text-on-surface-variant flex items-center gap-2">
              <span v-if="msg.systemIcon" class="material-symbols-outlined" style="font-size: 14px;">{{ msg.systemIcon }}</span>
              {{ msg.content }}
            </span>
          </div>

          <!-- Received Message -->
          <div v-else-if="msg.type === 'received'" class="flex gap-md max-w-[80%]">
            <img
              v-if="msg.avatar"
              :src="msg.avatar"
              :alt="msg.senderName"
              class="w-10 h-10 rounded-full object-cover flex-shrink-0 self-end mb-1"
            />
            <div class="flex flex-col gap-xs items-start">
              <div class="flex items-baseline gap-2 ml-1">
                <span class="font-label text-label-md text-on-surface">{{ msg.senderName }}</span>
                <span class="font-label text-label-sm text-on-surface-variant">{{ msg.timestamp }}</span>
              </div>
              <div
                v-if="msg.content"
                class="bg-surface-container-low text-on-surface p-md rounded-2xl rounded-bl-sm font-body text-body-md shadow-sm border border-surface-variant"
              >
                {{ msg.content }}
              </div>
              <!-- Embedded File Card -->
              <div
                v-if="msg.file"
                class="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm flex items-center gap-md w-72 mt-1 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <div :class="['w-10 h-10 rounded-lg flex items-center justify-center', msg.file.iconBg, msg.file.iconColor]">
                  <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">{{ msg.file.icon }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-label text-label-md text-on-surface truncate">{{ msg.file.name }}</p>
                  <p class="font-body text-body-sm text-on-surface-variant">{{ msg.file.size }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Sent Message -->
          <div v-else-if="msg.type === 'sent'" class="flex gap-md max-w-[80%] self-end">
            <div class="flex flex-col gap-xs items-end">
              <div class="flex items-baseline gap-2 mr-1">
                <span class="font-label text-label-sm text-on-surface-variant">{{ msg.timestamp }}</span>
              </div>
              <div
                :class="[
                  'bg-primary text-on-primary p-md font-body text-body-md shadow-sm',
                  msg.id === 3 ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl'
                ]"
              >
                {{ msg.content }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Input Area -->
      <div class="p-md bg-surface border-t border-outline-variant z-10">
        <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all flex flex-col">
          <textarea
            v-model="messageText"
            placeholder="输入消息..."
            rows="2"
            class="w-full bg-transparent border-none focus:ring-0 resize-none font-body text-body-md text-on-surface p-md min-h-[80px] outline-none"
            @keydown.enter.ctrl="sendMessage"
          />
          <div class="flex items-center justify-between p-sm border-t border-surface-container-low">
            <div class="flex items-center gap-xs">
              <button class="p-2 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors">
                <span class="material-symbols-outlined">add_circle</span>
              </button>
              <button class="p-2 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors">
                <span class="material-symbols-outlined">mood</span>
              </button>
              <button class="p-2 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors">
                <span class="material-symbols-outlined">attach_file</span>
              </button>
            </div>
            <button
              class="bg-primary hover:bg-primary-container text-on-primary p-2 rounded-xl flex items-center justify-center transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!messageText.trim()"
              @click="sendMessage"
            >
              <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">send</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Right Panel: Info & Files -->
    <aside class="w-[320px] border-l border-outline-variant bg-surface-container-lowest flex flex-col h-full flex-shrink-0 hidden lg:flex">
      <!-- Tabs -->
      <div class="flex items-center border-b border-surface-variant px-sm pt-sm">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="[
            'flex-1 py-md font-label text-label-md transition-colors',
            activeTab === tab.key
              ? 'text-primary border-b-2 border-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          ]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Panel Content -->
      <div class="flex-1 overflow-y-auto p-lg">
        <!-- Files Tab -->
        <template v-if="activeTab === 'files'">
          <!-- Shared Files Section -->
          <div class="mb-xl">
            <div class="flex items-center justify-between mb-md">
              <h3 class="font-headline text-headline-sm text-on-surface">最近分享的文件</h3>
              <button class="text-primary font-label text-label-sm hover:underline">查看全部</button>
            </div>
            <div class="flex flex-col gap-sm">
              <div
                v-for="file in sharedFiles"
                :key="file.id"
                class="group flex items-center gap-md p-sm rounded-lg hover:bg-surface-container-low transition-colors cursor-pointer border border-transparent hover:border-surface-variant"
              >
                <div :class="['w-10 h-10 rounded flex items-center justify-center flex-shrink-0', file.iconBg, file.iconColor]">
                  <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">{{ file.icon }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-label text-label-md text-on-surface truncate">{{ file.name }}</p>
                  <p class="font-body text-body-sm text-on-surface-variant">由 {{ file.sharedBy }} 分享 &bull; {{ file.date }}</p>
                </div>
                <button class="text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-primary">
                  <span class="material-symbols-outlined" style="font-size: 20px;">download</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Pinned Links Section -->
          <div>
            <h3 class="font-headline text-headline-sm text-on-surface mb-md">固定链接</h3>
            <div class="flex flex-col gap-sm">
              <a
                v-for="link in pinnedLinks"
                :key="link.title"
                href="#"
                class="flex items-center gap-sm p-sm rounded-lg border border-outline-variant hover:border-primary hover:bg-primary-fixed/10 transition-all text-on-surface"
              >
                <span class="material-symbols-outlined text-outline">link</span>
                <span class="font-label text-label-md flex-1 truncate">{{ link.title }}</span>
                <span class="material-symbols-outlined text-on-surface-variant" style="font-size: 16px;">open_in_new</span>
              </a>
            </div>
          </div>
        </template>

        <!-- Tasks Tab -->
        <template v-else-if="activeTab === 'tasks'">
          <div class="flex items-center justify-between mb-md">
            <h3 class="font-headline text-headline-sm text-on-surface">相关任务</h3>
            <button class="text-primary hover:text-primary-container transition-colors">
              <span class="material-symbols-outlined">add_circle</span>
            </button>
          </div>
          <div class="flex flex-col gap-sm">
            <div class="border border-outline-variant rounded-xl p-md hover:border-primary/50 transition-colors cursor-pointer">
              <div class="flex items-center gap-sm mb-xs">
                <span class="material-symbols-outlined text-primary" style="font-size: 18px;">radio_button_unchecked</span>
                <span class="font-label text-label-md text-on-surface">更新产品原型 v2.1</span>
              </div>
              <p class="font-body text-body-sm text-on-surface-variant ml-[26px]">Alex Chen &middot; 截止周三</p>
            </div>
            <div class="border border-outline-variant rounded-xl p-md hover:border-primary/50 transition-colors cursor-pointer">
              <div class="flex items-center gap-sm mb-xs">
                <span class="material-symbols-outlined text-primary" style="font-size: 18px;">radio_button_unchecked</span>
                <span class="font-label text-label-md text-on-surface">封装前端组件库</span>
              </div>
              <p class="font-body text-body-sm text-on-surface-variant ml-[26px]">Sarah &middot; 截止周四</p>
            </div>
            <div class="border border-outline-variant rounded-xl p-md hover:border-primary/50 transition-colors cursor-pointer">
              <div class="flex items-center gap-sm mb-xs">
                <span class="material-symbols-outlined text-secondary-fixed-dim" style="font-size: 18px;">check_circle</span>
                <span class="font-label text-label-md text-on-surface-variant line-through">准备视觉资产</span>
              </div>
              <p class="font-body text-body-sm text-on-surface-variant ml-[26px]">Alex Chen &middot; 已完成</p>
            </div>
          </div>
        </template>

        <!-- About Tab -->
        <template v-else>
          <div class="text-center mb-lg">
            <div class="w-16 h-16 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center text-2xl font-medium mx-auto mb-md">
              <span class="material-symbols-outlined" style="font-size: 32px;">group</span>
            </div>
            <h3 class="font-headline text-headline-sm text-on-surface">产品设计组</h3>
            <p class="font-body text-body-sm text-on-surface-variant mt-xs">创建于 2024年10月15日</p>
          </div>
          <div class="flex flex-col gap-lg">
            <div>
              <span class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">描述</span>
              <p class="font-body text-body-md text-on-surface mt-xs">产品设计讨论组，负责产品原型设计、交互评审和设计规范维护。</p>
            </div>
            <div>
              <span class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">成员 (6)</span>
              <div class="flex flex-col gap-sm mt-sm">
                <div class="flex items-center gap-sm">
                  <img
                    class="w-8 h-8 rounded-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBi5WvJWxASfoQ5aIg-t2nJn-I6KoBXLtsPrV4jhNkEKGL5NOoAmdBBUG5yVYv1lPmYcJxDAhz1mGCXm--kG3HYWHODYEUE3ornV3WfZV5Cbe_2ldnj4czTtRDToU3JTH2Z-WwTB4KD9kmj6l1D5feINt2M7-8jmmuRDSTM1zGIS51L0PhIA8mMBnFa_GD77dylQgOYmMSSke2exwWzH6NOZWxGu4Ovc7cgS9T1y5t6PWyJpGQ3Ztf2UhwOcBi55qo1SmYJDcpa2eA"
                    alt="Sarah"
                  />
                  <span class="font-body text-body-sm text-on-surface">Sarah</span>
                  <span class="font-label text-label-sm text-on-surface-variant">管理员</span>
                </div>
                <div class="flex items-center gap-sm">
                  <img
                    class="w-8 h-8 rounded-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBPJ995hcAM9uleO2fK9ARq3WDytY0zceFBEfPL79b3sRB2J7ES4vlOKyTx6JvrAgFUfGMFTuTSoFP9JokECOF7YCyXUDirCUaVXk0hlY37HYmRiQeNcHaDjdNz4NYnEUPmwaX-iNyoek_j-MUfFr3wCFM71RDO7PajsIyw8ch4ugbU1_h3K4T6GIHW1AzzH92lTiewXCQZTX_0gJtJdWysoidqMhcyQXE6HYXjYSmS3mWH08v5PADDdcjbngmelooX1HAMe7344Io"
                    alt="Alex Chen"
                  />
                  <span class="font-body text-body-sm text-on-surface">Alex Chen</span>
                </div>
                <div class="flex items-center gap-sm">
                  <img
                    class="w-8 h-8 rounded-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuChJWpuGIKaZ0wb6iGe3XXY3cQOa4G_wwcEGNZD-t_sAXnivm-mXSc7kNhECMj7iZSx6byWgSAWGTuWncG0jkhwr5AnYQmhtPOJtjZiXn4bAAySVODk6RUTEboPOr7H8X3HlNK9rH39ij4D_ZksrDyw3Tq0jrZ7GPRDGfXjdWlOfL1Kv7OydnHZrIfFmmc9DFCt-PtdAfiwxg3yvZ5UghfmiT3o6ETMDiwcV9YAjncjJL5dHnbdpm7qU_0Cim7ZzAqqAoKVH1YGlqw"
                    alt="张伟"
                  />
                  <span class="font-body text-body-sm text-on-surface">张伟</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </aside>
  </div>
</template>
