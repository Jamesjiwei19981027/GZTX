<template>
  <div class="calendar-view">
    <div class="header">
      <el-button @click="handlePrevMonth">&lt;</el-button>
      <h3>{{ currentYear }}年{{ currentMonth + 1 }}月</h3>
      <el-button @click="handleNextMonth">&gt;</el-button>
    </div>
    <div class="calendar-grid">
      <div class="weekday" v-for="day in weekdays" :key="day">{{ day }}</div>
      <div
        v-for="(date, index) in calendarDates"
        :key="index"
        class="date-cell"
        :class="{ 'is-today': isToday(date), 'is-other-month': !isCurrentMonth(date) }"
      >
        <span class="date-number">{{ getDate(date) }}</span>
        <div class="tasks-indicator" v-if="getTasksForDate(date).length > 0">
          <span class="task-count">{{ getTasksForDate(date).length }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTaskStore } from '@/stores/task'
import { getMonthCalendarDates } from '@/utils/date'
import dayjs from 'dayjs'

const taskStore = useTaskStore()
const currentYear = ref(dayjs().year())
const currentMonth = ref(dayjs().month())
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const calendarDates = computed(() => {
  return getMonthCalendarDates(currentYear.value, currentMonth.value)
})

function getDate(date: Date): number {
  return date.getDate()
}

function isToday(date: Date): boolean {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function isCurrentMonth(date: Date): boolean {
  return date.getMonth() === currentMonth.value
}

function getTasksForDate(date: Date): any[] {
  return []
}

function handlePrevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function handleNextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}
</script>

<style scoped>
.calendar-view {
  padding: 20px;
}
.header {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: #e0e0e0;
}
.weekday {
  background: #f5f5f5;
  padding: 10px;
  text-align: center;
}
.date-cell {
  background: #fff;
  padding: 10px;
  min-height: 80px;
}
.date-cell.is-today {
  background: #e3f2fd;
}
.date-cell.is-other-month {
  background: #fafafa;
}
.date-number {
  font-weight: bold;
}
.tasks-indicator {
  margin-top: 5px;
}
.task-count {
  background: #409eff;
  color: #fff;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
</style>
