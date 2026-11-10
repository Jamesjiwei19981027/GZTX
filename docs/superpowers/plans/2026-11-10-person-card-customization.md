# 人员卡片实现计划

目标：三层卡片配置在后端、网页桌面/手机与 Flutter 生效且可编辑。
设计：[设计文档](../specs/2026-11-10-person-card-customization-design.md)。
执行方式：当前隔离工作树内顺序执行，保留门禁证据，不提交。

- [x] 前端 npm.cmd ci；确认工作树无已有改动；alembic heads 核实旧 head。
- [x] 后端：统一验证/合并、TreeService写入、迁移、读取与PUT、ui-prefs、审计、权限和边界测试；全量 pytest（819 passed）。
- [x] 网页：共享CardFields与编辑器，桌面/手机/项目设置接入；排序、预览、lint、全量 npm test、浏览器交互和生产构建通过。
- [x] App：数据契约、控制器、原生卡片/折叠行、底部编辑器、显示设置与模板入口、widget测试、analyze/test（1153 passed）。
- [x] 检查diff和三端契约，完成报告；安卓设备操作因工具权限未执行，iOS真机未执行。

接口：PUT `/projects/{id}/card-template` 写模板对象；PUT `/projects/{id}/nodes/{node_id}/card-style` 写样式对象；PUT `/users/me/ui-prefs` 的 person_cards 项目映射写个人偏好。
预期测试：越权 403 且中文；非法配置 422；节点跨项目 404；空对象恢复；空 fields 数组不回落；关闭颜色与标签优先；修改不覆盖其他项目偏好。
