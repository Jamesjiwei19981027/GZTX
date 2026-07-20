## Task 10: P7 鈥?Vitest 鍗曞厓娴嬭瘯

**Files:**
- Modify: `frontend/package.json` scripts
- Create: `src/test/setup.ts`, `request.test.ts`, `auth.store.test.ts`, `RequireAuth.test.tsx`
- DevDep: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`

- [ ] **Step 1: 閰嶇疆**

```json
// package.json scripts 鐗囨
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc -b --noEmit"
}
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 2: 娴嬭瘯 getErrorMessage / setToken 琛屼负**

```typescript
// src/test/request.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getErrorMessage, setToken, getToken } from '@/api/request'

describe('request helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  it('setToken/getToken', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
  })
  it('getErrorMessage reads detail.message', () => {
    const err = {
      response: { data: { detail: { message: '鏃犳潈鎿嶄綔' } } },
    }
    expect(getErrorMessage(err)).toBe('鏃犳潈鎿嶄綔')
  })
})
```

- [ ] **Step 3: RequireAuth 娴嬭瘯**

鏃?token 鏃舵覆鏌?Navigate锛堝彲鐢?`MemoryRouter`锛夈€?
- [ ] **Step 4: 璺戞祴璇?*

```bash
cd frontend && npm test && npm run typecheck && npm run build
```

Expected: 鍏ㄧ豢銆?
- [ ] **Step 5: Commit**

```bash
git commit -am "test(frontend): vitest for request helpers and auth guard"
```

---

