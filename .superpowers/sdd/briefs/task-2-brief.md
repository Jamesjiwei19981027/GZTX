## Task 2: P0 鈥?request 瀹㈡埛绔?+ 绫诲瀷杩佺Щ

**Files:**
- Create: `frontend/src/api/request.ts`
- Create: `frontend/src/types/index.ts`, `frontend/src/types/collab.ts`锛堜粠 archive 澶嶅埗骞跺幓鎺?Vue 涓撶敤绫诲瀷锛?- Test: `frontend/src/test/request.test.ts`锛圴itest 鍦?Task 11 姝ｅ紡鎺ラ€氾紱鏈换鍔″彲鍏堝啓绾嚱鏁颁究浜庢祴锛?
**Interfaces:**
- Produces:
  - `getErrorMessage(err: unknown, fallback?: string): string`
  - `request.get/post/put/delete<T>(url, ...): Promise<T>`
  - 鎷︽埅鍣細`Authorization: Bearer ${localStorage.access_token}`
  - 401锛氭竻 token 骞?`window.location.href = '/login'`锛堟垨浜ょ粰璺敱锛岃涓哄榻?archive锛?
- [ ] **Step 1: 瀵圭収闃呰**

Read: `frontend-vue-archive/src/api/request.ts`  
閫愰」杩佺Щ baseURL銆佽В鍖?`response.data.data`銆侀敊璇?envelope銆?
- [ ] **Step 2: 瀹炵幇 request.ts**

```typescript
// frontend/src/api/request.ts 鈥?鏍稿績缁撴瀯锛堢粏鑺傚榻?archive锛?import axios, { type AxiosError } from 'axios'

const TOKEN_KEY = 'access_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getErrorMessage(err: unknown, fallback = '璇锋眰澶辫触'): string {
  const e = err as AxiosError<{ detail?: unknown; message?: string; code?: number }>
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in (detail as object)) {
    return String((detail as { message: string }).message)
  }
  if (e?.response?.data && typeof e.response.data === 'object' && 'message' in e.response.data) {
    return String((e.response.data as { message: string }).message)
  }
  return e?.message || fallback
}

const raw = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 60000,
})

raw.interceptors.request.use((config) => {
  const t = getToken()
  if (t) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${t}`
  }
  return config
})

raw.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'data' in body && 'code' in body) {
      if (body.code !== 200 && body.code !== 0) {
        return Promise.reject(body)
      }
      return body.data
    }
    return body
  },
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(err)
  },
)

export const request = {
  get: <T>(url: string, config?: Parameters<typeof raw.get>[1]) =>
    raw.get(url, config) as Promise<T>,
  post: <T>(url: string, data?: unknown, config?: Parameters<typeof raw.post>[2]) =>
    raw.post(url, data, config) as Promise<T>,
  put: <T>(url: string, data?: unknown, config?: Parameters<typeof raw.put>[2]) =>
    raw.put(url, data, config) as Promise<T>,
  delete: <T>(url: string, config?: Parameters<typeof raw.delete>[1]) =>
    raw.delete(url, config) as Promise<T>,
}

export default request
```

> 鑻?archive 瑙ｅ寘瑙勫垯涓嶅悓锛?*浠?archive 涓哄噯**鏀瑰啓锛屽嬁鑷垱 envelope銆?
- [ ] **Step 3: 澶嶅埗 types**

```bash
cp frontend-vue-archive/src/types/index.ts frontend/src/types/index.ts
cp frontend-vue-archive/src/types/collab.ts frontend/src/types/collab.ts
# 鎵嬪伐鍒犻櫎浠?Vue 浣跨敤鐨?import
```

- [ ] **Step 4: 杩佺Щ鍏朵綑 api 妯″潡锛堝彲鍚?commit锛?*

浠?archive 澶嶅埗骞舵敼 import 璺緞锛?
- `auth.ts`, `task.ts`, `notifications.ts`, `collab.ts`, `categories.ts`, `tags.ts`, `reminders.ts`

淇濊瘉鏃?`vue` import銆?
- [ ] **Step 5: Commit**

```bash
git add frontend/src/api frontend/src/types
git commit -m "feat(frontend): port axios request client and API/types from Vue archive"
```

---

