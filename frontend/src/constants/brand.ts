import { Language } from '../types';

/**
 * 品牌信息的唯一出处（APP 端 app/lib/config/brand.dart 与此对齐）。
 *
 * 此前同一个产品在各端露出多个名字（Web 顶栏「Flow」、登录页「烂笔头」、
 * APP「WorkTodo」等）。改名只应改这一处，各组件从这里取值。
 */
export const BRAND = {
  zh: {
    name: '烂笔头',
    tagline: '好记性不如烂笔头',
    fullName: '烂笔头 · 工作待办提醒系统',
  },
  en: {
    name: 'WorkTodo',
    tagline: 'Get things done',
    fullName: 'WorkTodo · Task & Accountability',
  },
} as const;

export function getBrandName(lang: Language): string {
  return BRAND[lang].name;
}

export function getBrandTagline(lang: Language): string {
  return BRAND[lang].tagline;
}

export function getBrandFullName(lang: Language): string {
  return BRAND[lang].fullName;
}
