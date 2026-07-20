import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from '@/routes/RequireAuth'
import { setToken } from '@/api/request'

function renderWithAuth(initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route
          path="/protected"
          element={
            <RequireAuth>
              <div>secret-content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('redirects to /login when no token', () => {
    renderWithAuth()
    expect(screen.getByText('login-page')).toBeInTheDocument()
    expect(screen.queryByText('secret-content')).not.toBeInTheDocument()
  })

  it('renders children when token is present', () => {
    setToken('valid-token')
    renderWithAuth()
    expect(screen.getByText('secret-content')).toBeInTheDocument()
    expect(screen.queryByText('login-page')).not.toBeInTheDocument()
  })
})
