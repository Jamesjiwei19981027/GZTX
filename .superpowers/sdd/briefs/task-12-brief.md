## Task 12: P7 鈥?Docker銆佹枃妗ｃ€侀棬绂佹ā鏉裤€佸洖婊氳鏄?
**Files:**
- Modify: `Dockerfile.prod` / `docker-compose*.yml` / nginx 鑻ュ啓姝?Vue 璺緞
- Modify: `Claude.md`, `docs/06-閮ㄧ讲杩愮淮鎸囧崡.md`, `docs/椤圭洰閫昏緫鏂囨。.md`锛堟妧鏈爤 Vue鈫扲eact锛?- Create: `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`
- Modify: spec 鐘舵€?鈫?瀹炵幇涓?宸插疄鐜帮紙鍚堝叆鍚庯級

- [ ] **Step 1: Docker 鍓嶇鏋勫缓**

纭锛?
```dockerfile
# 浼唬鐮侊細WORKDIR frontend && npm ci && npm run build && 鎷疯礉 dist
```

鏋勫缓锛?
```bash
docker compose -f docker-compose.yml build frontend
```

Expected: 鎴愬姛銆?
- [ ] **Step 2: 浜х墿瀵嗛挜鎶芥煡**

```bash
# 鍦?dist 鍐呮悳绱?rg -i "sk-|smtp_password|SECRET_KEY" frontend/dist || true
```

Expected: 鏃犵湡瀹炲瘑閽ャ€?
- [ ] **Step 3: 闂ㄧ鍕鹃€夋ā鏉?*

鍒涘缓 `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`锛屽鍒?spec 搂6.1鈥?.12 涓?G1鈥揋10 涓?checkbox锛岀暀 SHA / digest / soak 鏃堕棿瀛楁銆?
- [ ] **Step 4: 鍥炴粴姝ラ鎴愭枃**

鍐欐槑锛歝ompose 鎸囧洖 Vue 闀滃儚 digest 鎴栦粠 `frontend-vue-archive` 鏋勫缓鏃у墠绔殑鍛戒护銆?
- [ ] **Step 5: 鍥炴粴婕旂粌锛圙6锛?*

鍦?staging锛氬垏鍒版棫鍓嶇 鈫?楠岃瘉鐧诲綍 鈫?鍒囧洖 React銆傜瑪璁拌褰曘€?
- [ ] **Step 6: Commit**

```bash
git commit -am "docs(frontend): React stack, docker, gates template, rollback procedure"
```

---

