import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@/lib/supabase', async () => {
  const fake = await import('@/test/fake-supabase')
  return { supabase: fake.supabase }
})

const {
  signedOut,
  signedInAs,
  signedInWithoutProfile,
  signInWithOtp,
  verifyOtp,
} = await import('@/test/fake-supabase')
const { AuthProvider } = await import('@/lib/auth')
const App = (await import('./App')).default

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
  return render(<App />, { wrapper })
}

describe('App', () => {
  beforeEach(() => {
    signedOut()
    window.history.pushState({}, '', '/')
  })

  it('asks a signed-out volunteer for their email', async () => {
    renderApp()

    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Email me a code' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Sale day' }),
    ).not.toBeInTheDocument()
  })

  it('emails a code, then signs in with the code typed in', async () => {
    renderApp()

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'yuki@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }))

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'yuki@example.com' }),
    )

    fireEvent.change(screen.getByLabelText('Code'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({
        email: 'yuki@example.com',
        token: '123456',
        type: 'email',
      }),
    )
  })

  it('rejects a code that is not 6 digits without calling Supabase', async () => {
    renderApp()

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'yuki@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: '12ab' },
    })
    verifyOtp.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the 6-digit code.',
    )
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('sends someone with no profile to the coordinator', async () => {
    signedInWithoutProfile('stranger@example.com')
    renderApp()

    expect(
      await screen.findByRole('heading', {
        name: 'Ask the coordinator to add you',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('stranger@example.com')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Sale day' }),
    ).not.toBeInTheDocument()
  })

  it('shows the header and all five tabs to a volunteer on the team', async () => {
    signedInAs()
    renderApp()

    expect(
      await screen.findByRole('heading', { name: 'Snack Shack' }),
    ).toBeInTheDocument()

    for (const label of ['Sale day', 'Sell', 'Buy', 'Items', 'Insights']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('offers the admin screens to the coordinator only', async () => {
    signedInAs({ role: 'volunteer', display_name: 'Yuki' })
    const volunteer = renderApp()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Signed in as Yuki' }),
    )
    expect(await screen.findByText('yuki@example.com')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Team and settings' }),
    ).not.toBeInTheDocument()
    volunteer.unmount()

    signedInAs({ role: 'admin', display_name: 'Calvin' })
    renderApp()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Signed in as Calvin' }),
    )
    expect(
      await screen.findByRole('link', { name: 'Team and settings' }),
    ).toBeInTheDocument()
  })
})
