/// 品牌信息的唯一出处（与 Web 的 frontend/src/constants/brand.ts 对齐）。
///
/// 此前同一个产品在各端露出四个名字：Web 登录页「Flow 生产力」、Web 侧边栏
/// 「烂笔头PM」、浏览器标题第三种、APP 登录页「WorkTodo」。改名只应改这一处。
class Brand {
  static const String name = '烂笔头PM';
  static const String tagline = '好记性不如烂笔头';

  /// 应用标题栏用的全称
  static const String fullName = '烂笔头PM · 工作待办提醒系统';
}
