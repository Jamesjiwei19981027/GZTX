/**
 * 品牌信息的唯一出处。
 *
 * 此前登录页写「Flow 生产力」（设计稿模板 Flow Productivity 的残留）、
 * 侧边栏写「烂笔头PM」、浏览器标题写第三种、智能体提示词里又是 WorkTodo，
 * 同一个产品在一次会话里能露出四个名字。改动名称只应改这一处。
 */
export const BRAND = {
  name: '烂笔头PM',
  tagline: '好记性不如烂笔头',
  /** 产品全称，用于标题栏、页脚等需要说明"这是什么"的位置 */
  fullName: '烂笔头PM · 工作待办提醒系统',
} as const

/** 版权年份取当前年，别再写死（原来固定是 2024） */
export const copyright = () => `© ${new Date().getFullYear()} ${BRAND.name}. 保留所有权利.`
