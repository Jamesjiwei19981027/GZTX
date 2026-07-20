## Task 5: P3 鈥?鏃ュ巻 + 涓汉璁剧疆锛圫MTP / LLM锛?
**Files:**
- Create: `pages/CalendarPage.tsx`, `pages/SettingsPage.tsx`
- Use: `api/notifications.ts`锛坄getSmtpConfig`, `updateSmtpConfig`, `getLlmConfig`, `updateLlmConfig`, `testLlmConfig`, `sendTestEmail`锛?
- [ ] **Step 1: 鏃ュ巻**

瀵圭収 `CalendarView.vue`銆傚厑璁?UI 绠€鍖栵紝浣嗗繀椤伙細鎸夋棩灞曠ず浠诲姟銆佽兘杩涜鎯呫€佹棤浠诲姟/鏈変换鍔″彲鍖哄垎銆備笉鍙己璺敱銆?
- [ ] **Step 2: Settings**

瀵圭収 `SettingsView.vue` 涓汉 SMTP + 涓汉 LLM 鍖哄潡锛?
- 瀵嗙爜/api_key锛歚type="password"`锛屽凡淇濆瓨鏃?placeholder銆岀暀绌轰笉淇敼銆?- 淇濆瓨 payload锛氱┖瀵嗛挜瀛楁 **涓嶈** 鏀惧叆璇锋眰浣擄紙鎴栦紶 `""` 鐢卞悗绔拷鐣モ€斺€斾笌 archive/鍚庣绾﹀畾涓€鑷达級
- Fake LLM 鍙祴杩為€?
- [ ] **Step 3: 鍐掔儫 S3/S4**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(frontend): calendar and personal settings (SMTP/LLM)"
```

---

