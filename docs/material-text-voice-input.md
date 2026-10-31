# 材料提交：独立文字与语音输入

材料提交页现在有独立的“文字材料”输入框。可以只填写工作进展、完成情况、验收结论或问题后提交，不再强制上传附件；文件可作为补充。

## 使用方式

1. 在人轴责任事项中打开“提交材料”。
2. 直接填写“文字材料”，或点击“语音输入”。麦克风权限仅在主动录音时申请。
3. 点击“结束录音并转文字”，识别内容追加到输入框，不覆盖此前输入。
4. 检查、修改识别文字，可按需添加附件，然后点击“提交材料”。

Web 和 APP 另提供“选择音频转文字”。微信小程序使用自身录音管理器。单次录音最多两分钟，后端音频上传上限为 20 MB。

取消录音、关闭表单、页面切到后台或切换项目时释放麦克风并取消旧请求。转写失败保留手动输入，提供重试；识别文字必须由本人确认提交后才成为正式材料。材料继续受公司、项目及责任节点权限约束。

## 配置真实语音服务

管理员可在“我的 → 管理与集成 → 语音识别配置 (ASR)”选择 Whisper 兼容服务或自有兼容服务，保存服务基址（通常以 `/v1` 结尾）、模型名称及可选密钥。接口在基址后追加 `/audio/transcriptions`；自有服务可不使用密钥。

配置通过 `PUT /companies/{company_id}/bindings/asr` 持久化。密钥加密存储，配置读取和保存响应不回传密钥。用户绑定继续优先于公司默认，并受公司的 ASR 白名单约束。保存配置不等于外部服务已连通，以实际转写结果为准。

三端均调用 `POST /asr/transcribe`，携带音频、`company_id` 和 `project_id`。后端验证公司在职成员、项目权限、文件类型和大小。未配置真实服务时返回 503 和明确说明，绝不将占位文字填入材料；录音不在此接口中持久化。

## 本轮验证（2026-10-20）

- 后端相关套件：17 项通过，覆盖纯文字材料真实提交、项目权限、空音频拒绝、未配置提示、实际兼容服务请求格式、密钥加密与不回显、既有 ASR 绑定和通话转写回归。兼容服务协议测试使用模拟服务响应，不代表外部模型准确率验收。
- Web 定向浏览器测试：10 项通过，包含材料上传、纯文字提交、录音追加、授权失败、取消录音、跨项目延迟结果隔离、转写重试、ASR 配置真实保存，以及现有 16 个设置页面的访问链路。
- 微信小程序逻辑测试：10 项通过，含新增加的纯文字提交、录音取消及跨项目转写隔离。未在微信开发者工具或微信真机中录音验收。
- Android 15 / Pixel_9_Pro：重新构建并安装 APK，实测系统麦克风授权、真实 MediaRecorder 录音及真实音频到后端。当前隔离环境未配置真实 ASR，收到 503 后重试入口可见且原文字保留。结果位于 `frontend/android-acceptance/test-results/material-voice/result.json`。
- `flutter analyze`、Web TypeScript 检查与生产构建通过。iOS 增加麦克风用途声明，但没有 iOS 设备录音验证。

复测命令：

```powershell
cd E:\workspace\gongzuotix\backend
.venv312\Scripts\python.exe -m pytest -q tests/collab/test_material_voice_input.py tests/collab/test_asr_router.py tests/collab/test_bindings_api.py tests/collab/test_communication_ai_closed_loop.py
cd ..\frontend
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5177'
npx playwright test e2e/material-voice-input.spec.ts e2e/evidence-report-scope.spec.ts e2e/mobile-settings.spec.ts --project=chromium
npx tsx scripts/test-android-material-voice.ts
cd ..\miniprogram
node --test tests/*.test.cjs
```
