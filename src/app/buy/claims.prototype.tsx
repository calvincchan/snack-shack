// PROTOTYPE, throwaway. Question: what should the claim detail and refund
// flow look like? Three variants on Buy > Claims, switched with ?variant=A|B|C.
// Mock data in memory only; nothing touches Supabase. Lives on the
// prototype/claim-refund branch, never main.
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, Receipt, Undo2 } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PrototypeSwitcher } from '@/components/prototype-switcher'
import {
  centsToDollarString,
  dollarStringToCents,
  formatCents,
} from '@/lib/money'

// ---------------------------------------------------------------------------
// Mock model (the rules decided in the grilling session)
// ---------------------------------------------------------------------------

type Line = { id: string; item: string; pieces: number; costCents: number }
type Refund = {
  id: string
  lineId: string
  pieces: number
  amountCents: number
  refundedOn: string
  note: string
  slip: boolean
  by: string
}
type Claim = {
  id: string
  label: string
  purchasedOn: string
  store: string
  buyer: string
  status: 'to_pay' | 'paid'
  paidAt?: string
  paymentRef?: string
  lines: Line[]
  refunds: Refund[]
}
type Role = 'Jennifer' | 'Yuki' | 'Coordinator'
type SalePhase = 'none' | 'lineup' | 'selling'
type World = {
  claims: Claim[]
  role: Role
  sale: SalePhase
  lineup: string[]
  onHand: Record<string, number>
}

const initialWorld: World = {
  role: 'Jennifer',
  sale: 'none',
  lineup: ['Freezies', 'Chips'],
  onHand: { Chips: 30, Freezies: 6, 'Gummy bears': 24, Popcorn: 12 },
  claims: [
    {
      id: 'c3',
      label: 'SS-003',
      purchasedOn: '2026-10-02',
      store: 'Wholesale Club',
      buyer: 'Yuki',
      status: 'to_pay',
      lines: [{ id: 'l5', item: 'Popcorn', pieces: 12, costCents: 1599 }],
      refunds: [],
    },
    {
      id: 'c2',
      label: 'SS-002',
      purchasedOn: '2026-09-30',
      store: 'Costco',
      buyer: 'Jennifer',
      status: 'to_pay',
      lines: [
        { id: 'l2', item: 'Chips', pieces: 30, costCents: 1899 },
        { id: 'l3', item: 'Freezies', pieces: 40, costCents: 1249 },
        { id: 'l4', item: 'Gummy bears', pieces: 24, costCents: 899 },
      ],
      refunds: [],
    },
    {
      id: 'c1',
      label: 'SS-001',
      purchasedOn: '2026-09-21',
      store: 'Costco',
      buyer: 'Jennifer',
      status: 'paid',
      paidAt: '2026-09-28',
      paymentRef: 'E-transfer',
      lines: [{ id: 'l1', item: 'Chips', pieces: 30, costCents: 1899 }],
      refunds: [],
    },
  ],
}

const today = '2026-10-06'

function receiptCents(claim: Claim) {
  return claim.lines.reduce((sum, line) => sum + line.costCents, 0)
}
function refundedCents(claim: Claim) {
  return claim.refunds.reduce((sum, r) => sum + r.amountCents, 0)
}
function netCents(claim: Claim) {
  return receiptCents(claim) - refundedCents(claim)
}
function lineLeft(claim: Claim, line: Line) {
  const refunds = claim.refunds.filter((r) => r.lineId === line.id)
  return {
    pieces: line.pieces - refunds.reduce((s, r) => s + r.pieces, 0),
    cents: line.costCents - refunds.reduce((s, r) => s + r.amountCents, 0),
  }
}
function isRefunded(claim: Claim) {
  return claim.status === 'to_pay' && netCents(claim) === 0
}

/** Why this volunteer can't refund on this claim at all, or null. */
function claimBlock(world: World, claim: Claim): string | null {
  if (claim.status === 'paid') return 'Already paid. Ask the treasurer.'
  if (isRefunded(claim)) return 'Everything on this claim is refunded.'
  if (world.role !== claim.buyer && world.role !== 'Coordinator')
    return `Only ${claim.buyer} or a coordinator can refund.`
  return null
}

/** The refund_purchase() errors, shown as-is. */
function refundError(
  world: World,
  claim: Claim,
  line: Line,
  pieces: number,
  amountCents: number,
): string | null {
  const blocked = claimBlock(world, claim)
  if (blocked) return blocked
  if (world.sale === 'selling' && world.lineup.includes(line.item))
    return "Refund after today's sale closes."
  const left = lineLeft(claim, line)
  if (!Number.isInteger(pieces) || pieces < 1) return 'Enter the pieces.'
  if (pieces > left.pieces) return `Only ${left.pieces} left on this line.`
  const onHand = world.onHand[line.item] ?? 0
  if (pieces > onHand) return `Only ${onHand} on hand.`
  if (!Number.isFinite(amountCents) || amountCents <= 0)
    return 'Enter the refund amount.'
  if (amountCents > left.cents)
    return `Up to ${formatCents(left.cents)} left on this line.`
  return null
}

type RefundDraft = {
  pieces: string
  amount: string
  refundedOn: string
  note: string
  slip: boolean
  /** Once the volunteer types an amount, pieces stop recalculating it. */
  amountEdited: boolean
}
const emptyDraft: RefundDraft = {
  pieces: '',
  amount: '',
  refundedOn: today,
  note: '',
  slip: false,
  amountEdited: false,
}

/** Share of what's left on the line. All remaining pieces = all remaining cost, so no penny left over. */
function prefillCents(left: { pieces: number; cents: number }, pieces: number) {
  if (left.pieces === 0) return 0
  return Math.round((left.cents * pieces) / left.pieces)
}

/** Prefilled with everything left on the line; the slip has the final word. */
function draftFor(left: { pieces: number; cents: number }): RefundDraft {
  return {
    ...emptyDraft,
    pieces: String(left.pieces),
    amount: centsToDollarString(left.cents),
  }
}

function useWorld() {
  const [world, setWorld] = useState(initialWorld)

  function addRefund(claimId: string, lineId: string, draft: RefundDraft) {
    const claim = world.claims.find((c) => c.id === claimId)!
    const line = claim.lines.find((l) => l.id === lineId)!
    const pieces = Number(draft.pieces)
    const amountCents = dollarStringToCents(draft.amount)
    const error = refundError(world, claim, line, pieces, amountCents)
    if (error) {
      toast.error(error)
      return false
    }
    setWorld({
      ...world,
      onHand: {
        ...world.onHand,
        [line.item]: world.onHand[line.item] - pieces,
      },
      claims: world.claims.map((c) =>
        c.id !== claimId
          ? c
          : {
              ...c,
              refunds: [
                ...c.refunds,
                {
                  id: crypto.randomUUID(),
                  lineId,
                  pieces,
                  amountCents,
                  refundedOn: draft.refundedOn,
                  note: draft.note,
                  slip: draft.slip,
                  by: world.role,
                },
              ],
            },
      ),
    })
    toast.success(`Refund saved. ${pieces} ${line.item} out of stock.`)
    return true
  }

  function undoRefund(claimId: string, refundId: string) {
    const claim = world.claims.find((c) => c.id === claimId)!
    if (claim.status === 'paid') {
      toast.error('Already paid. Ask the treasurer.')
      return
    }
    const refund = claim.refunds.find((r) => r.id === refundId)!
    const line = claim.lines.find((l) => l.id === refund.lineId)!
    setWorld({
      ...world,
      onHand: {
        ...world.onHand,
        [line.item]: world.onHand[line.item] + refund.pieces,
      },
      claims: world.claims.map((c) =>
        c.id !== claimId
          ? c
          : { ...c, refunds: c.refunds.filter((r) => r.id !== refundId) },
      ),
    })
    toast.success('Refund undone. Pieces back in stock.')
  }

  return { world, setWorld, addRefund, undoRefund }
}

type Api = ReturnType<typeof useWorld>

// ---------------------------------------------------------------------------
// Switcher and prototype controls (not part of the design being judged)
// ---------------------------------------------------------------------------

const variants = [
  { key: 'A', name: 'Bottom sheet, inline refund' },
  { key: 'B', name: 'Full page, step flow' },
  { key: 'C', name: 'Expand in list, receipt' },
]

export function ClaimsPrototype({ variant }: { variant: string }) {
  const api = useWorld()
  return (
    <div className="flex flex-col gap-4 pb-24">
      <Controls api={api} />
      {variant === 'A' && <VariantA api={api} />}
      {variant === 'B' && <VariantB api={api} />}
      {variant === 'C' && <VariantC api={api} />}
      <PrototypeSwitcher variants={variants} />
    </div>
  )
}

function Controls({ api }: { api: Api }) {
  const { world, setWorld } = api
  return (
    <details className="rounded-xl border-2 border-dashed border-fuchsia-500 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-fuchsia-700 dark:text-fuchsia-300">
        Prototype state: {world.role} · sale {world.sale}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <Pick
          label="Signed in as"
          value={world.role}
          options={['Jennifer', 'Yuki', 'Coordinator']}
          onChange={(role) => setWorld({ ...world, role: role as Role })}
        />
        <Pick
          label={`Sale day (lineup: ${world.lineup.join(', ')})`}
          value={world.sale}
          options={['none', 'lineup', 'selling']}
          onChange={(sale) => setWorld({ ...world, sale: sale as SalePhase })}
        />
        <p className="text-muted-foreground">
          On hand:{' '}
          {Object.entries(world.onHand)
            .map(([item, n]) => `${item} ${n}`)
            .join(' · ')}
        </p>
        <p className="text-muted-foreground">
          Claims:{' '}
          {world.claims
            .map(
              (c) =>
                `${c.label} ${formatCents(receiptCents(c))} − ${formatCents(refundedCents(c))} = ${formatCents(netCents(c))}`,
            )
            .join(' · ')}
        </p>
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-11"
          onClick={() => setWorld(initialWorld)}
        >
          Reset
        </Button>
      </div>
    </details>
  )
}

function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'min-h-10 flex-1 rounded-md border px-2',
              option === value
                ? 'bg-foreground text-background'
                : 'text-foreground',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits (small on purpose: each variant owns its layout)
// ---------------------------------------------------------------------------

function ListTotals({ claims }: { claims: Claim[] }) {
  const owed = claims
    .filter((c) => c.status === 'to_pay')
    .reduce((s, c) => s + netCents(c), 0)
  const paid = claims
    .filter((c) => c.status === 'paid')
    .reduce((s, c) => s + netCents(c), 0)
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        ['Owed to volunteers', owed],
        ['Reimbursed this term', paid],
      ].map(([label, cents]) => (
        <div
          key={label}
          className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3"
        >
          <span className="text-muted-foreground text-sm">{label}</span>
          <span className="font-heading text-xl font-semibold tabular-nums">
            {formatCents(cents as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

function Summary({ claim }: { claim: Claim }) {
  const refunded = refundedCents(claim)
  const last =
    claim.status === 'paid' ? 'Paid' : isRefunded(claim) ? 'Refunded' : 'To pay'
  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      Receipt {formatCents(receiptCents(claim))}
      {refunded > 0 && ` · Refunded ${formatCents(refunded)}`}
      {' · '}
      <span className="text-foreground font-semibold">
        {last} {formatCents(netCents(claim))}
      </span>
    </p>
  )
}

function StatusChip({ claim }: { claim: Claim }) {
  const text =
    claim.status === 'paid' ? 'Paid' : isRefunded(claim) ? 'Refunded' : 'To pay'
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        text === 'To pay'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {text}
    </span>
  )
}

function receiptToast() {
  toast('Prototype: opens the receipt photo in a new tab.')
}

function RefundFields({
  draft,
  setDraft,
  left,
}: {
  draft: RefundDraft
  setDraft: (draft: RefundDraft) => void
  left: { pieces: number; cents: number }
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rf-pieces">Pieces returned</Label>
          <Input
            id="rf-pieces"
            inputMode="numeric"
            className="min-h-11 tabular-nums"
            placeholder={`Up to ${left.pieces}`}
            value={draft.pieces}
            onChange={(e) => {
              const pieces = e.target.value
              const n = Number(pieces)
              setDraft({
                ...draft,
                pieces,
                amount:
                  draft.amountEdited || !Number.isInteger(n) || n < 1
                    ? draft.amount
                    : centsToDollarString(
                        prefillCents(left, Math.min(n, left.pieces)),
                      ),
              })
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rf-amount">Refund amount</Label>
          <Input
            id="rf-amount"
            inputMode="decimal"
            className="min-h-11 tabular-nums"
            placeholder="$0.00"
            value={draft.amount}
            onChange={(e) =>
              setDraft({ ...draft, amount: e.target.value, amountEdited: true })
            }
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-1 text-xs">
        Worked out from the receipt, tax included. Check it against the refund
        slip. Up to {formatCents(left.cents)}.
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rf-date">Refunded on</Label>
        <Input
          id="rf-date"
          type="date"
          className="min-h-11"
          value={draft.refundedOn}
          onChange={(e) => setDraft({ ...draft, refundedOn: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="rf-note">Note (optional)</Label>
        <Input
          id="rf-note"
          className="min-h-11"
          placeholder="Box was crushed"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-11"
        onClick={() => setDraft({ ...draft, slip: !draft.slip })}
      >
        <Receipt className="size-4" aria-hidden="true" />
        {draft.slip ? 'Slip photo added ✓' : 'Add refund slip photo (optional)'}
      </Button>
    </div>
  )
}

function RefundMeta({ refund }: { refund: Refund }) {
  return (
    <span className="text-muted-foreground text-xs">
      {refund.refundedOn} · {refund.by}
      {refund.slip && ' · slip'}
      {refund.note && ` · ${refund.note}`}
    </span>
  )
}

/** To pay grouped by volunteer; $0 claims move to Paid as "Refunded". */
function splitClaims(claims: Claim[]) {
  const toPay = claims.filter((c) => c.status === 'to_pay' && !isRefunded(c))
  const done = claims.filter((c) => c.status === 'paid' || isRefunded(c))
  const groups = new Map<string, Claim[]>()
  for (const c of toPay)
    groups.set(c.buyer, [...(groups.get(c.buyer) ?? []), c])
  return { groups: [...groups.entries()], done }
}

// ---------------------------------------------------------------------------
// Variant A: today's list; row opens a bottom sheet; refund form opens inline
// under the line inside the sheet.
// ---------------------------------------------------------------------------

function VariantA({ api }: { api: Api }) {
  const { world } = api
  const [openId, setOpenId] = useState<string | null>(null)
  const open = world.claims.find((c) => c.id === openId) ?? null
  const { groups, done } = splitClaims(world.claims)

  function Row({ claim }: { claim: Claim }) {
    return (
      <button
        type="button"
        onClick={() => setOpenId(claim.id)}
        className="text-foreground flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
      >
        <span>
          <span className="font-medium">{claim.label}</span>{' '}
          <span className="text-muted-foreground">
            {claim.store} · {claim.purchasedOn}
          </span>
        </span>
        <span className="tabular-nums">{formatCents(netCents(claim))}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ListTotals claims={world.claims} />
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">To pay</h2>
        {groups.map(([buyer, claims]) => (
          <div
            key={buyer}
            className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3"
          >
            <p className="flex justify-between font-medium">
              {buyer}
              <span className="font-heading text-lg font-semibold tabular-nums">
                {formatCents(claims.reduce((s, c) => s + netCents(c), 0))}
              </span>
            </p>
            {claims.map((c) => (
              <Row key={c.id} claim={c} />
            ))}
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Paid</h2>
        <div className="border-border bg-card divide-border divide-y rounded-xl border">
          {done.map((c) => (
            <div key={c.id} className="p-3">
              <Row claim={c} />
              <p className="text-muted-foreground text-sm">
                {c.buyer} ·{' '}
                {isRefunded(c) ? 'Refunded' : `${c.paymentRef} · ${c.paidAt}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] gap-4 overflow-y-auto"
        >
          {open && <SheetBody api={api} claim={open} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SheetBody({ api, claim }: { api: Api; claim: Claim }) {
  const { world, addRefund, undoRefund } = api
  const [formLine, setFormLine] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const blocked = claimBlock(world, claim)

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {claim.label} <StatusChip claim={claim} />
        </SheetTitle>
        <SheetDescription>
          {claim.store} · {claim.purchasedOn} · {claim.buyer}
          {claim.status === 'paid' &&
            ` · Paid ${claim.paidAt} · ${claim.paymentRef}`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        <Button
          type="button"
          variant="outline"
          className="text-foreground min-h-11"
          onClick={receiptToast}
        >
          <Receipt className="size-4" aria-hidden="true" />
          Receipt photo
        </Button>

        <ul className="divide-border flex flex-col divide-y">
          {claim.lines.map((line) => {
            const left = lineLeft(claim, line)
            const refunds = claim.refunds.filter((r) => r.lineId === line.id)
            return (
              <li key={line.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{line.item}</span>{' '}
                    <span className="text-muted-foreground tabular-nums">
                      {line.pieces} pieces
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatCents(line.costCents)}
                  </span>
                </div>
                {refunds.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 pl-3 text-sm"
                  >
                    <span className="flex flex-col">
                      <span>Refund {r.pieces} pieces</span>
                      <RefundMeta refund={r} />
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="tabular-nums">
                        −{formatCents(r.amountCents)}
                      </span>
                      {claim.status === 'to_pay' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-foreground size-11"
                          aria-label="Undo refund"
                          onClick={() => undoRefund(claim.id, r.id)}
                        >
                          <Undo2 className="size-4" />
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
                {!blocked && left.pieces > 0 && formLine !== line.id && (
                  <Button
                    type="button"
                    variant="link"
                    className="text-foreground h-11 self-start px-0"
                    onClick={() => {
                      setFormLine(line.id)
                      setDraft(emptyDraft)
                    }}
                  >
                    Refund
                  </Button>
                )}
                {formLine === line.id && (
                  <div className="bg-muted/50 flex flex-col gap-3 rounded-lg p-3">
                    <RefundFields
                      draft={draft}
                      setDraft={setDraft}
                      left={left}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="text-foreground min-h-11 flex-1"
                        onClick={() => setFormLine(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="text-primary-foreground min-h-11 flex-1"
                        onClick={() => {
                          if (addRefund(claim.id, line.id, draft))
                            setFormLine(null)
                        }}
                      >
                        Save refund
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <Summary claim={claim} />
        {blocked && <p className="text-muted-foreground text-sm">{blocked}</p>}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Variant B: row opens a full page (back arrow); refund is a separate
// three-step flow: pick line, enter slip, check the new total.
// ---------------------------------------------------------------------------

function VariantB({ api }: { api: Api }) {
  const { world, addRefund, undoRefund } = api
  const [openId, setOpenId] = useState<string | null>(null)
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const [lineId, setLineId] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const claim = world.claims.find((c) => c.id === openId) ?? null

  if (!claim) {
    const { groups, done } = splitClaims(world.claims)
    const rows = [...groups.flatMap(([, cs]) => cs), ...done]
    return (
      <div className="flex flex-col gap-4">
        <ListTotals claims={world.claims} />
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="text-foreground flex min-h-14 w-full items-center gap-3 p-3 text-left"
              >
                <span className="flex flex-1 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {c.label} <StatusChip claim={c} />
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {c.buyer} · {c.store} · {c.purchasedOn}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCents(netCents(c))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const blocked = claimBlock(world, claim)
  const line = claim.lines.find((l) => l.id === lineId) ?? null

  function close() {
    setOpenId(null)
    setStep(0)
  }

  if (step === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="ghost"
          className="text-foreground min-h-11 self-start"
          onClick={close}
        >
          <ArrowLeft className="size-4" /> Claims
        </Button>
        <div>
          <h2 className="font-heading flex items-center gap-2 text-2xl font-semibold">
            {claim.label} <StatusChip claim={claim} />
          </h2>
          <p className="text-muted-foreground">
            {claim.buyer} · {claim.store} · {claim.purchasedOn}
          </p>
          {claim.status === 'paid' && (
            <p className="text-muted-foreground">
              Paid {claim.paidAt} · {claim.paymentRef}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={receiptToast}
          className="bg-muted text-muted-foreground flex h-40 items-center justify-center rounded-xl"
        >
          <Receipt className="mr-2 size-5" /> Tap to open receipt photo
        </button>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1 font-normal">Item</th>
              <th className="py-1 text-right font-normal">Pieces</th>
              <th className="py-1 text-right font-normal">Cost</th>
            </tr>
          </thead>
          <tbody>
            {claim.lines.map((l) => (
              <tr key={l.id} className="border-border border-t">
                <td className="py-2">{l.item}</td>
                <td className="py-2 text-right">{l.pieces}</td>
                <td className="py-2 text-right">{formatCents(l.costCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {claim.refunds.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">Refunds</h3>
            {claim.refunds.map((r) => {
              const l = claim.lines.find((x) => x.id === r.lineId)!
              return (
                <div
                  key={r.id}
                  className="border-border flex items-center justify-between rounded-lg border p-2 text-sm"
                >
                  <span className="flex flex-col">
                    <span>
                      {l.item} · {r.pieces} pieces · −
                      {formatCents(r.amountCents)}
                    </span>
                    <RefundMeta refund={r} />
                  </span>
                  {claim.status === 'to_pay' && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-foreground min-h-11"
                      onClick={() => undoRefund(claim.id, r.id)}
                    >
                      Undo
                    </Button>
                  )}
                </div>
              )
            })}
          </section>
        )}
        <Summary claim={claim} />
        {blocked ? (
          <p className="text-muted-foreground text-sm">{blocked}</p>
        ) : (
          <Button
            type="button"
            className="text-primary-foreground sticky bottom-24 min-h-12"
            onClick={() => {
              setStep(1)
              setLineId(null)
              setDraft(emptyDraft)
            }}
          >
            Refund items
          </Button>
        )}
      </div>
    )
  }

  const left = line ? lineLeft(claim, line) : { pieces: 0, cents: 0 }
  const pieces = Number(draft.pieces)
  const amount = dollarStringToCents(draft.amount)

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        className="text-foreground min-h-11 self-start"
        onClick={() => setStep((step - 1) as 0 | 1 | 2)}
      >
        <ArrowLeft className="size-4" /> Back
      </Button>
      <p className="text-muted-foreground text-sm">
        Refund on {claim.label} · Step {step} of 3
      </p>

      {step === 1 && (
        <>
          <h2 className="font-heading text-xl font-semibold">
            What went back?
          </h2>
          {claim.lines.map((l) => {
            const lLeft = lineLeft(claim, l)
            return (
              <button
                key={l.id}
                type="button"
                disabled={lLeft.pieces === 0}
                onClick={() => {
                  setLineId(l.id)
                  setStep(2)
                }}
                className="border-border text-foreground flex min-h-14 items-center justify-between rounded-xl border p-3 text-left disabled:opacity-50"
              >
                <span>
                  <span className="font-medium">{l.item}</span>
                  <span className="text-muted-foreground block text-sm">
                    {lLeft.pieces} of {l.pieces} pieces left to refund
                  </span>
                </span>
                <span className="tabular-nums">{formatCents(lLeft.cents)}</span>
              </button>
            )
          })}
        </>
      )}

      {step === 2 && line && (
        <>
          <h2 className="font-heading text-xl font-semibold">
            {line.item}: from the refund slip
          </h2>
          <RefundFields draft={draft} setDraft={setDraft} left={left} />
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            onClick={() => {
              const error = refundError(world, claim, line, pieces, amount)
              if (error) toast.error(error)
              else setStep(3)
            }}
          >
            Next
          </Button>
        </>
      )}

      {step === 3 && line && (
        <>
          <h2 className="font-heading text-xl font-semibold">Check and save</h2>
          <div className="bg-card border-border flex flex-col gap-2 rounded-xl border p-4 tabular-nums">
            <Row2 label="Receipt" cents={receiptCents(claim)} />
            <Row2
              label="Already refunded"
              cents={-refundedCents(claim)}
              hide={refundedCents(claim) === 0}
            />
            <Row2
              label={`This refund: ${pieces} ${line.item}`}
              cents={-amount}
            />
            <div className="border-border border-t pt-2">
              <Row2
                label={`To pay ${claim.buyer}`}
                cents={netCents(claim) - amount}
                bold
              />
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            {pieces} {line.item} come out of stock.
          </p>
          <Button
            type="button"
            className="text-primary-foreground min-h-12"
            onClick={() => {
              if (addRefund(claim.id, line.id, draft)) setStep(0)
            }}
          >
            Save refund
          </Button>
        </>
      )}
    </div>
  )
}

function Row2({
  label,
  cents,
  bold,
  hide,
}: {
  label: string
  cents: number
  bold?: boolean
  hide?: boolean
}) {
  if (hide) return null
  return (
    <p className={cn('flex justify-between', bold && 'text-lg font-semibold')}>
      <span>{label}</span>
      <span>{formatCents(cents)}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Variant C: no navigation. Rows expand in place into a store-receipt style
// printout (refunds print as minus lines); refund opens a centred dialog
// with the line picked from a select.
// ---------------------------------------------------------------------------

function VariantC({ api }: { api: Api }) {
  const { world, addRefund, undoRefund } = api
  const [expanded, setExpanded] = useState<string | null>('c2')
  const [dialogClaim, setDialogClaim] = useState<string | null>(null)
  const [lineId, setLineId] = useState('')
  const [draft, setDraft] = useState(emptyDraft)
  const { groups, done } = splitClaims(world.claims)
  const dClaim = world.claims.find((c) => c.id === dialogClaim) ?? null
  const dLine = dClaim?.lines.find((l) => l.id === lineId) ?? null

  function ClaimRow({ claim }: { claim: Claim }) {
    const isOpen = expanded === claim.id
    const blocked = claimBlock(world, claim)
    return (
      <li className="border-border bg-card rounded-xl border">
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : claim.id)}
          aria-expanded={isOpen}
          className="text-foreground flex min-h-14 w-full items-center gap-2 p-3 text-left"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              isOpen && 'rotate-180',
            )}
          />
          <span className="flex-1">
            <span className="font-medium">{claim.label}</span>{' '}
            <span className="text-muted-foreground text-sm">
              {claim.buyer} · {claim.store}
            </span>
          </span>
          <StatusChip claim={claim} />
          <span className="font-semibold tabular-nums">
            {formatCents(netCents(claim))}
          </span>
        </button>
        {isOpen && (
          <div className="flex flex-col gap-3 px-3 pb-3">
            <div className="bg-background rounded-lg border border-dashed p-3 font-mono text-sm">
              <p className="text-center">{claim.store.toUpperCase()}</p>
              <p className="text-muted-foreground mb-2 text-center text-xs">
                {claim.purchasedOn} · {claim.label} · {claim.buyer}
              </p>
              {claim.lines.map((l) => (
                <div key={l.id}>
                  <p className="flex justify-between">
                    <span>
                      {l.item} ×{l.pieces}
                    </span>
                    <span>{formatCents(l.costCents)}</span>
                  </p>
                  {claim.refunds
                    .filter((r) => r.lineId === l.id)
                    .map((r) => (
                      <p
                        key={r.id}
                        className="flex items-center justify-between pl-3 text-red-700 dark:text-red-400"
                      >
                        <span>
                          REFUND ×{r.pieces}{' '}
                          <span className="text-xs">{r.refundedOn}</span>
                        </span>
                        <span className="flex items-center">
                          −{formatCents(r.amountCents)}
                          {claim.status === 'to_pay' && (
                            <button
                              type="button"
                              onClick={() => undoRefund(claim.id, r.id)}
                              aria-label="Undo refund"
                              className="text-foreground ml-1 flex size-11 items-center justify-center"
                            >
                              <Undo2 className="size-4" />
                            </button>
                          )}
                        </span>
                      </p>
                    ))}
                </div>
              ))}
              <p className="mt-2 flex justify-between border-t border-dashed pt-2 font-bold">
                <span>
                  {claim.status === 'paid'
                    ? `PAID ${claim.paidAt}`
                    : isRefunded(claim)
                      ? 'REFUNDED'
                      : 'TO PAY'}
                </span>
                <span>{formatCents(netCents(claim))}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-foreground min-h-11 flex-1"
                onClick={receiptToast}
              >
                <Receipt className="size-4" /> Photo
              </Button>
              {!blocked && (
                <Button
                  type="button"
                  className="text-primary-foreground min-h-11 flex-1"
                  onClick={() => {
                    setDialogClaim(claim.id)
                    const first = claim.lines.find(
                      (l) => lineLeft(claim, l).pieces > 0,
                    )
                    setLineId(first?.id ?? '')
                    setDraft(
                      first ? draftFor(lineLeft(claim, first)) : emptyDraft,
                    )
                  }}
                >
                  Refund
                </Button>
              )}
            </div>
            {blocked && (
              <p className="text-muted-foreground text-sm">{blocked}</p>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ListTotals claims={world.claims} />
      {groups.map(([buyer, claims]) => (
        <section key={buyer} className="flex flex-col gap-2">
          <h2 className="flex justify-between font-semibold">
            To pay {buyer}
            <span className="tabular-nums">
              {formatCents(claims.reduce((s, c) => s + netCents(c), 0))}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {claims.map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Paid</h2>
        <ul className="flex flex-col gap-2">
          {done.map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
        </ul>
      </section>

      <Dialog
        open={dClaim !== null}
        onOpenChange={(o) => !o && setDialogClaim(null)}
      >
        <DialogContent>
          {dClaim && (
            <>
              <DialogHeader>
                <DialogTitle>Refund on {dClaim.label}</DialogTitle>
                <DialogDescription>
                  Enter what the refund slip says.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1">
                <Label htmlFor="rf-line">Item</Label>
                <select
                  id="rf-line"
                  value={lineId}
                  onChange={(e) => {
                    setLineId(e.target.value)
                    const next = dClaim.lines.find(
                      (l) => l.id === e.target.value,
                    )
                    if (next) setDraft(draftFor(lineLeft(dClaim, next)))
                  }}
                  className="border-input bg-background text-foreground min-h-11 rounded-md border px-2"
                >
                  {dClaim.lines.map((l) => (
                    <option
                      key={l.id}
                      value={l.id}
                      disabled={lineLeft(dClaim, l).pieces === 0}
                    >
                      {l.item} ({lineLeft(dClaim, l).pieces} pieces,{' '}
                      {formatCents(lineLeft(dClaim, l).cents)})
                    </option>
                  ))}
                </select>
              </div>
              {dLine && (
                <RefundFields
                  draft={draft}
                  setDraft={setDraft}
                  left={lineLeft(dClaim, dLine)}
                />
              )}
              <Button
                type="button"
                className="text-primary-foreground min-h-12"
                onClick={() => {
                  if (dLine && addRefund(dClaim.id, dLine.id, draft))
                    setDialogClaim(null)
                }}
              >
                Save refund
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
