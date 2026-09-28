import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('shows the header and all five tabs', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Snack Shack' }),
    ).toBeInTheDocument()

    for (const label of ['Sale day', 'Sell', 'Buy', 'Items', 'Insights']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })
})
