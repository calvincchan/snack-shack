import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAuth } from '@/lib/auth'
import { useItems, type Item } from '@/lib/items'
import {
  STORES,
  useLogPurchase,
  useVolunteers,
  type PurchaseLine,
} from '@/lib/purchases'
import {
  centsToDollarString,
  dollarStringToCents,
  formatCents,
} from '@/lib/money'
import type { Enums } from '@/lib/database.types'

/**
 * One receipt is one claim. The form is plain state rather than a form
 * library: nearly every control here is a custom button. Prices are not set
 * here; the Items tab does that.
 */

type LineDraft = {
  key: string
  /** An existing item's id, or 'new'. */
  itemId: string
  name: string
  type: Enums<'item_type'>
  storage: Enums<'storage_kind'>
  pieces: string
  cost: string
}

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    itemId: 'new',
    name: '',
    type: 'snack',
    storage: 'shelf',
    pieces: '',
    cost: '',
  }
}

function today() {
  return new Date().toLocaleDateString('en-CA')
}

/** Cost of one piece in cents, or null until both numbers are in. */
function costPerPiece(line: LineDraft): number | null {
  const pieces = Number(line.pieces)
  const cents = dollarStringToCents(line.cost)
  if (
    !Number.isFinite(cents) ||
    !Number.isFinite(pieces) ||
    pieces <= 0 ||
    cents <= 0
  )
    return null
  return cents / pieces
}

export type PrefilledLine = {
  type: Enums<'item_type'>
  pieces: number
  costCents: number
}

/** Deal check hands its numbers over; the buyer still needs to name the item. */
function prefilled(line: PrefilledLine): LineDraft {
  return {
    ...emptyLine(),
    type: line.type,
    pieces: String(line.pieces),
    cost: centsToDollarString(line.costCents),
  }
}

export function LogPurchase({ prefill }: { prefill?: PrefilledLine | null }) {
  // Kept across retries so a save that failed halfway cannot create a second
  // claim (the database function is idempotent on this id).
  const [purchaseId, setPurchaseId] = useState(() => crypto.randomUUID())
  const [purchasedOn, setPurchasedOn] = useState(today)
  const [store, setStore] = useState<string>(STORES[0])
  const [buyerId, setBuyerId] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [lines, setLines] = useState<LineDraft[]>(() => [
    prefill ? prefilled(prefill) : emptyLine(),
  ])
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const { profile, isCoordinator } = useAuth()
  const items = useItems()
  const volunteers = useVolunteers()
  const log = useLogPurchase()

  const totalCents = lines.reduce((sum, line) => {
    const cents = dollarStringToCents(line.cost)
    return sum + (Number.isFinite(cents) ? cents : 0)
  }, 0)

  function update(key: string, change: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    )
  }

  function reset() {
    setPurchaseId(crypto.randomUUID())
    setPurchasedOn(today())
    setStore(STORES[0])
    setReceipt(null)
    setLines([emptyLine()])
    setProblem(null)
  }

  function save() {
    setProblem(null)

    // Volunteers log their own; only the coordinator picks someone else.
    const buyer = isCoordinator ? buyerId : (profile?.id ?? '')
    if (!buyer) return setProblem('Pick who is being reimbursed.')
    if (!receipt) return setProblem('Attach a photo of the receipt.')

    const payload: PurchaseLine[] = []
    for (const [index, line] of lines.entries()) {
      const where = `Receipt line ${index + 1}`
      const pieces = Number(line.pieces)
      const cents = dollarStringToCents(line.cost)

      if (line.itemId === 'new' && line.name.trim() === '') {
        return setProblem(`${where}: name the item.`)
      }
      if (!Number.isInteger(pieces) || pieces <= 0) {
        return setProblem(`${where}: how many pieces in total?`)
      }
      if (!Number.isFinite(cents) || cents <= 0) {
        return setProblem(`${where}: what did it cost, tax included?`)
      }

      payload.push({
        itemId: line.itemId === 'new' ? null : line.itemId,
        newItem:
          line.itemId === 'new'
            ? { name: line.name.trim(), type: line.type, storage: line.storage }
            : null,
        pieces,
        costCents: cents,
      })
    }

    log.mutate(
      {
        id: purchaseId,
        purchasedOn,
        store,
        buyerId: buyer,
        receipt: receipt,
        lines: payload,
      },
      {
        onSuccess: () => {
          setSaved(purchaseId)
          toast.success('Receipt logged and claimed.')
          reset()
        },
        onError: (error) => setProblem(error.message),
      },
    )
  }

  if (saved) {
    return <Logged onAnother={() => setSaved(null)} />
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchased-on">Date</Label>
            <Input
              id="purchased-on"
              type="date"
              className="inline-block min-h-12 max-w-full min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left"
              value={purchasedOn}
              onChange={(event) => setPurchasedOn(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store">Store</Label>
            <select
              id="store"
              className="border-input bg-card text-foreground min-h-12 rounded-md border px-3"
              value={store}
              onChange={(event) => setStore(event.target.value)}
            >
              {STORES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isCoordinator && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buyer">Bought by (reimbursed later)</Label>
            <select
              id="buyer"
              className="border-input bg-card text-foreground min-h-12 rounded-md border px-3"
              value={buyerId}
              onChange={(event) => setBuyerId(event.target.value)}
            >
              <option value="">Pick a volunteer</option>
              {(volunteers.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {lines.map((line, index) => (
        <ReceiptLine
          key={line.key}
          index={index}
          line={line}
          items={items.data ?? []}
          canRemove={lines.length > 1}
          onChange={(change) => update(line.key, change)}
          onRemove={() =>
            setLines((current) => current.filter((l) => l.key !== line.key))
          }
        />
      ))}

      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-12 border-dashed"
        onClick={() => setLines((current) => [...current, emptyLine()])}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add another receipt line
      </Button>

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receipt">Attach a photo of the receipt</Label>
          <Input
            id="receipt"
            type="file"
            accept="image/*"
            capture="environment"
            className="min-h-12"
            onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
          />
        </div>

        <p className="flex items-baseline justify-between">
          <span>Receipt total</span>
          <span className="font-heading text-xl font-semibold tabular-nums">
            {formatCents(totalCents)}
          </span>
        </p>

        <p className="text-muted-foreground text-sm">
          Only log snack lines; leave off anything personal on the same receipt.
        </p>

        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}

        <Button
          type="button"
          className="text-primary-foreground min-h-12"
          disabled={log.isPending}
          onClick={save}
        >
          {log.isPending ? 'Saving…' : 'Save and claim reimbursement'}
        </Button>
      </section>
    </div>
  )
}

function Logged({ onAnother }: { onAnother: () => void }) {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="font-heading text-lg font-semibold">Receipt logged</h3>
      <p className="text-muted-foreground text-sm">
        The stock is in and the claim is waiting for the treasurer. You can see
        it under Claims.
      </p>
      <Button
        type="button"
        className="text-primary-foreground min-h-12"
        onClick={onAnother}
      >
        Log another receipt
      </Button>
    </div>
  )
}

function ReceiptLine({
  index,
  line,
  items,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number
  line: LineDraft
  items: Item[]
  canRemove: boolean
  onChange: (change: Partial<LineDraft>) => void
  onRemove: () => void
}) {
  const isNew = line.itemId === 'new'
  const perPiece = costPerPiece(line)

  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Receipt line {index + 1}
        </h3>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-foreground"
            aria-label={`Remove receipt line ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`item-${line.key}`}>Item</Label>
        <select
          id={`item-${line.key}`}
          className="border-input bg-card text-foreground min-h-12 rounded-md border px-3"
          value={line.itemId}
          onChange={(event) => onChange({ itemId: event.target.value })}
        >
          <option value="new">＋ New item</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {isNew && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${line.key}`}>Name kids will see</Label>
            <Input
              id={`name-${line.key}`}
              className="min-h-12"
              placeholder="e.g. Rice crackers"
              value={line.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>

          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={`Type for receipt line ${index + 1}`}
            className="w-full"
            value={line.type}
            onValueChange={(value) =>
              value && onChange({ type: value as LineDraft['type'] })
            }
          >
            <ToggleGroupItem
              value="snack"
              className="text-foreground min-h-12 flex-1"
            >
              Snack
            </ToggleGroupItem>
            <ToggleGroupItem
              value="treat"
              className="text-foreground min-h-12 flex-1"
            >
              Treat (sugary)
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={`Storage for receipt line ${index + 1}`}
            className="w-full"
            value={line.storage}
            onValueChange={(value) =>
              value && onChange({ storage: value as LineDraft['storage'] })
            }
          >
            <ToggleGroupItem
              value="shelf"
              className="text-foreground min-h-12 flex-1"
            >
              Shelf
            </ToggleGroupItem>
            <ToggleGroupItem
              value="freezer"
              className="text-foreground min-h-12 flex-1"
            >
              ❄ Freezer
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`pieces-${line.key}`}>Pieces in total</Label>
          <Input
            id={`pieces-${line.key}`}
            type="number"
            inputMode="numeric"
            min={1}
            className="min-h-12 tabular-nums"
            value={line.pieces}
            onChange={(event) => onChange({ pieces: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cost-${line.key}`}>Cost incl. tax</Label>
          <Input
            id={`cost-${line.key}`}
            type="text"
            inputMode="decimal"
            className="min-h-12 tabular-nums"
            value={line.cost}
            onChange={(event) => onChange({ cost: event.target.value })}
          />
        </div>
      </div>

      {perPiece !== null && (
        <p className="text-muted-foreground text-sm">
          Cost{' '}
          <span className="text-foreground font-semibold tabular-nums">
            {formatCents(perPiece)}
          </span>{' '}
          a piece ({perPiece.toFixed(1)}¢)
        </p>
      )}
    </section>
  )
}
