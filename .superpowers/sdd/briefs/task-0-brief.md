## Task 0: 鍒嗘敮銆佸綊妗?Vue銆佹墦 tag

**Files:**
- Move: `frontend/` 鈫?`frontend-vue-archive/`
- Create: empty `frontend/` placeholder until Task 1
- Git: branch + tag

**Interfaces:**
- Produces: 鍙鐓х殑 `frontend-vue-archive/package.json` 涓庡畬鏁?`src/`

- [ ] **Step 1: 纭宸ヤ綔鍖哄共鍑€骞跺彲鏋勫缓 Vue锛堝綊妗ｅ墠鍩虹嚎锛?*

```bash
cd frontend
npm ci
npm run build
```

Expected: build 鎴愬姛锛堟垨璁板綍宸茬煡澶辫触锛岀姝㈠湪鏈煡鐘舵€佷笅褰掓。锛夈€?
- [ ] **Step 2: 寤哄垎鏀苟绉诲姩鐩綍**

```bash
git checkout -b frontend-react-rewrite
git mv frontend frontend-vue-archive
mkdir frontend
echo "# React frontend placeholder 鈥?see implementation plan" > frontend/README.md
git add frontend/README.md
git status
```

- [ ] **Step 3: 鎵?tag 骞舵彁浜ゅ綊妗?*

```bash
git add -A
git commit -m "chore(frontend): archive Vue app to frontend-vue-archive"
git tag vue-frontend-last
```

- [ ] **Step 4: 楠岃瘉褰掓。浠嶅彲鏋勫缓**

```bash
cd frontend-vue-archive
npm ci
npm run build
```

Expected: 鎴愬姛锛圙6 鍥炴粴鍩虹嚎锛夈€?
---

