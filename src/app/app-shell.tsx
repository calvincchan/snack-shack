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

const tabs = [
  { to: '/', label: 'Sale day', icon: CalendarCheck2 },
  { to: '/sell', label: 'Sell', icon: ShoppingBasket },
  { to: '/buy', label: 'Buy', icon: ShoppingCart },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesCombined },
]

export function AppShell() {
  return (
    <BrowserRouter>
      <div className="bg-background text-foreground mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="border-border flex flex-col gap-0.5 border-b px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
          <h1 className="font-heading text-lg font-semibold">Snack Shack</h1>
          <p className="text-muted-foreground text-sm">No sale day scheduled</p>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<SaleDayPage />} />
            <Route path="/sell" element={<SellPage />} />
            <Route path="/buy" element={<BuyPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/insights" element={<InsightsPage />} />
          </Routes>
        </main>

        <nav className="border-border bg-card grid grid-cols-5 border-t pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
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
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Toaster />
    </BrowserRouter>
  )
}
