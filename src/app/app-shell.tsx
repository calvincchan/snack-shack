import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import {
  CalendarCheck2,
  ChartNoAxesCombined,
  Package,
  ShoppingBasket,
  ShoppingCart,
} from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { cn } from 'cn'
import { SaleDayPage } from '@/app/routes/sale-day'
import { SellPage } from '@/app/routes/sell'
import { BuyPage } from '@/app/routes/buy'
import { ItemsPage } from '@/app/routes/items'
import { InsightsPage } from '@/app/routes/insights'
import { AdminPage } from '@/app/routes/admin'
import { SignInPage } from '@/app/routes/sign-in'
import { NoProfilePage } from '@/app/routes/no-profile'
import { AccountMenu } from '@/app/account-menu'
import { useAuth } from '@/lib/auth'
import { useItems } from '@/lib/items'
import { useSaleDay } from '@/lib/sale-day'
import { formatSaleDate } from '@/lib/time'

const tabs = [
  { to: '/', label: 'Sale day', icon: CalendarCheck2 },
  { to: '/sell', label: 'Sell', icon: ShoppingBasket },
  { to: '/buy', label: 'Buy', icon: ShoppingCart },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesCombined },
]

export function AppShell() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <main
        className="bg-background text-foreground flex min-h-dvh items-center justify-center"
        aria-busy="true"
      >
        <p className="text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (state.status === 'signed-out') return <SignInPage />
  if (state.status === 'no-profile')
    return <NoProfilePage email={state.email} />

  return <MemberShell />
}

function MemberShell() {
  const items = useItems()
  const saleDay = useSaleDay()
  const needPrice = (items.data ?? []).filter(
    (item) => item.priceCents === null,
  ).length

  return (
    <BrowserRouter>
      <div className="bg-background text-foreground mx-auto flex h-dvh max-w-md flex-col overflow-hidden">
        <header className="border-border flex shrink-0 items-center gap-3 border-b px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="font-heading text-lg font-semibold">Snack Shack</h1>
            <p className="text-muted-foreground truncate text-sm">
              {saleDay.data
                ? `Sale day ${saleDay.data.dayNo} · ${formatSaleDate(saleDay.data.saleDate)}`
                : 'No sale day scheduled'}
            </p>
          </div>
          <AccountMenu />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Routes>
            <Route path="/" element={<SaleDayPage />} />
            <Route path="/sell" element={<SellPage />} />
            <Route path="/buy" element={<BuyPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>

        <nav className="border-border bg-card grid shrink-0 grid-cols-5 border-t pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 py-2 text-xs',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>
                {label}
                {to === '/items' && needPrice > 0 && (
                  <span className="text-primary"> ({needPrice})</span>
                )}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
      <Toaster />
    </BrowserRouter>
  )
}
