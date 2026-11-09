import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginGate } from '../../src/components/LoginGate'
import type { AuthTokenPayload } from '../../src/api/auth'
import '../../src/index.css'
import '../../src/mobile/mobile.css'

function SharedAuthHarness() {
  const [result, setResult] = useState<AuthTokenPayload>()
  return <>
    <LoginGate onLoggedIn={setResult} />
    {result && <output aria-label="登录结果">{JSON.stringify(result)}</output>}
  </>
}

createRoot(document.getElementById('root')!).render(<SharedAuthHarness />)
