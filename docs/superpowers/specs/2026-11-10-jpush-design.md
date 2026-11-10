# 极光安卓系统推送设计

范围：邀请制网页与安卓 App，正式 App 使用 `USE_WEB_SHELL=true` 的共享网页；原生 Flutter 页面也接入相同能力。生产 env 示例明确邀请制，不修改现有注册实现，不接入真实账号，不提交代码。

## 开关与数据流

服务器仅在 `JPUSH_APP_KEY`、`JPUSH_MASTER_SECRET` 去空格后均非空时启用。留空允许生产启动；非空占位符在 `DEBUG=false` 时拒绝启动。`JPUSH_APNS_PRODUCTION=false`。客户端通过需登录的 `GET /api/v1/push/status` 获取 `{enabled: bool}`，失败按关闭处理。

`push_devices` 保存 id、user_id（users 外键）、platform（android/ios）、唯一 registration_id、app_version、created_at、last_seen_at、disabled_at。使用跨 SQLite/PG 的 SQLAlchemy 类型与方言 upsert。迁移接已核实 head `fq5e6f7a8b9c`。设备属于账号而非项目；通知仍从已有租户/项目鉴权后的用户收件任务产生，不接受客户端指定收件用户。

需登录的 `POST /api/v1/push/devices` 登记或刷新设备，已有 rid 原子转移至当前用户并清除停用状态；`DELETE /api/v1/push/devices/{registration_id}` 仅注销自己的设备，重复删除幂等，其他用户设备返回 404。未配置时 POST 为关闭的空操作，DELETE 仍允许清理。

notify 队列增加 push 渠道，按 `notify_pref.channels.push.enabled`（缺省 true）过滤，未配置时不入队；消费者发送前复查配置、偏好和账号状态。httpx Basic 认证调用 `https://api.jpush.cn/v3/push`，按用户有效 rid 分批发送。extras 只携带 template_key 和既有对象 ID，不发送任意业务正文或凭据。发送失败安全记录状态码/错误编号，不记录响应正文、异常文本、请求或认证信息。1011 表示指定目标全部无效，仅停用该次请求设备；不从模糊参数错误推断设备无效。

普通协作提醒按系统消息 `options.classification=1`，厂商 secondary_push；不虚构未经申请的 channel_id。分类依据极光 REST API 与重要通知实践；上线时需按真实厂商审批结果复核。

## App、隐私与跳转

官方 `jpush_flutter 3.6.0`（2026-11-10 核查 pub.dev）。`--dart-define=JPUSH_APPKEY=...` 同时供 Dart 与 Gradle manifestPlaceholders 使用，包名 `com.worktodo.worktodo_app`，默认渠道 developer-default。无 AppKey 不调用 SDK、不要求账号、不妨碍构建。MasterSecret 仅服务器持有。

首次启动的隐私同意门阻止内容挂载直到用户同意；拒绝可停留并再次查看政策。政策明确 SDK 提供方、目的、数据范围与官方政策链接。同意落本地后才调用 setAuth(true)、setup、通知权限申请。无密钥时仍不初始化。WebView 桥只接受配置网页同源的消息，不把网页令牌交给 SDK；网页使用自己的 API 会话登记/注销。原生页面使用已有 ApiClient。退出在撤销令牌前注销设备、停推并清除通知；重新登录后恢复。

点击回调及冷启动 launch notification 统一解包 extras，原生复用 notificationDestination 命名路由；共享网页复用现有站内通知目标映射。登录与项目列表准备好前暂存点击，先选择目标项目再跳转；已不可访问的项目回到消息通知列表。服务器仍对所有目标对象鉴权。

正式 WebView 使用会话编号关联宿主与网页事件。SDK 准备 rid 后，由网页凭自己的登录会话 POST 登记；只有服务器确认启用、会话编号及 rid 匹配的 pushRegistered 才恢复接收和交付点击。退出先停止本机推送，再有界等待服务端清理，登记/注销请求各最多等待 1500ms，避免推送网络故障拖住退出。迟到的旧会话确认不能恢复推送。原生模式同样先 POST 完成归属更新再 resumePush。

网页设置显示“手机推送”，App 显示“系统推送”；push/status=false 或请求失败时隐藏。共用既有 push 偏好；现有浏览器推送也使用该偏好，不引入新的存储键。

## 实施与验收顺序

1. 后端先写设备、配置、请求体、失效 rid、偏好与故障隔离测试，再实现模型/迁移/API/通道。
2. App 写配置/同意门/登记注销/点击映射测试，再接 SDK、隐私门、两种宿主和设置。
3. 网页使用桩验证开关、桥接登记注销及点击落页；避免改并行任务指定文件。
4. 亲自运行用户指定的全部后端、网页、Flutter 门禁及无密钥 debug APK 构建。结果原始尾部保存至根目录 FEATJP-REPORT.md。可用模拟器做移动验证；iOS/微信及真实推送验收如未执行须明确记录。

## 上线前用户清单

- 注册极光账号，创建应用，Android 包名填 `com.worktodo.worktodo_app`。
- 将 AppKey/MasterSecret 填入服务器 env；App 仅传 AppKey：`flutter build apk --dart-define=JPUSH_APPKEY=实际AppKey`，正式外壳默认开启。
- 设置 `REGISTRATION_MODE=invite_only`，运行迁移，确认生产密钥门禁与 HTTPS、包名、签名。
- 可选逐个申请小米/华为/OPPO/vivo/荣耀通道，填写 Gradle 预留位置、厂商配置与依赖，按审批结果配置渠道分类；当前不填真实参数、不宣称厂商离线链路已开通。
- 在真实安卓设备验收隐私同意前无 SDK 活动、Android 13+ 通知授权、后台/杀进程到达、点击冷启动、退出/换号隔离。真实推送必须在获得账号后另行验收。

参考：[官方插件](https://pub.dev/packages/jpush_flutter)、[合规指引](https://docs.jiguang.cn/jpush/client/jghgzy_a_i_h)、[REST v3](https://docs.jiguang.cn/jpush/server/push/rest_api_v3_push)、[重要通知](https://docs.jiguang.cn/jpush/practice/important_notification_delivery)。
