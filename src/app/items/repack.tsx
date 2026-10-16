import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Stepper } from '@/components/stepper'
import { BandPill, TypeDot } from '@/components/item-bits'
import { NewItemFields, type NewItemDraft } from '@/components/new-item-fields'
import { itemName, signedPieces, type Item } from '@/lib/items'
import { formatCents } from '@/lib/money'
import {
  formatMargin,
  marginBand,
  marginOf,
  priceLabel,
  priceOptions,
  type PriceOption,
} from '@/lib/pricing'
import { PriceOptionGrid } from '@/components/price-option-grid'
import {
  costPerPackCents,
  repackedMessage,
  repackMoves,
  shortSources,
  useRepack,
  type RepackSource,
} from '@/lib/repack'

const STEPS = ['What went in', 'What you made', 'Check'] as const

/**
 * Repack (ADR-0019): pieces of some items made into another item, in three
 * steps. Saving moves the stock and the cost over in one call.
 */
export function Repack({
  items,
  onDone,
}: {
  items: Item[]
  onDone: () => void
}) {
  // One id per repack, kept while a retry sends the same thing so a repeat
  // tap cannot double it. An edit after an error gets a fresh id, so the
  // edit is saved rather than answered with the earlier attempt.
  const attempt = useRef<{ id: string; sent: string } | null>(null)
  const [step, setStep] = useState(0)
  const [sources, setSources] = useState<RepackSource[]>([])
  const [packItemId, setPackItemId] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<NewItemDraft | null>(null)
  const [price, setPrice] = useState<PriceOption | null>(null)
  const [packs, setPacks] = useState<number | null>(null)
  const repack = useRepack()

  // Pack items are what you make; everything else is what goes in.
  const ingredients = items.filter((item) => !item.madeByRepack)
  const packItems = items.filter((item) => item.madeByRepack)

  // A preview, like the price options: repack() works out the stored cost.
  const costPerPack = costPerPackCents(sources, items)
  const packItem = items.find((item) => item.id === packItemId)
  const packName = newItem ? newItem.name.trim() : (packItem?.name ?? '')
  const sellsAt: PriceOption | null = newItem
    ? price
    : packItem?.priceCents != null
      ? { priceCents: packItem.priceCents, bundleSize: packItem.bundleSize }
      : null
  const margin = sellsAt
    ? marginOf(costPerPack, sellsAt.priceCents, sellsAt.bundleSize)
    : null
  const madeReady =
    (packItem !== undefined || (newItem !== null && packName !== '')) &&
    (newItem === null || price !== null) &&
    (packs ?? 0) > 0

  function toggleSource(itemId: string) {
    setSources((prev) =>
      prev.some((s) => s.itemId === itemId)
        ? prev.filter((s) => s.itemId !== itemId)
        : [...prev, { itemId, perPack: 1 }],
    )
  }

  function toMade() {
    setStep(1)
    // Nothing made before: go straight to the new item.
    if (packItems.length === 0) startNewItem()
  }

  function startNewItem() {
    setPackItemId(null)
    setNewItem((prev) => prev ?? { name: '', type: 'treat', storage: 'shelf' })
    const suggested = priceOptions(costPerPack).find((o) => o.suggested)
    setPrice((prev) => prev ?? suggested ?? null)
  }

  function submit() {
    if (packs === null) return
    const made = {
      packItemId: newItem ? null : packItemId,
      newItem: newItem && price ? { ...newItem, ...price } : null,
      packs,
      sources,
    }
    const sent = JSON.stringify(made)
    if (attempt.current?.sent !== sent) {
      attempt.current = { id: crypto.randomUUID(), sent }
    }
    repack.mutate(
      { id: attempt.current.id, ...made },
      {
        onSuccess: () => {
          toast.success(repackedMessage(packs, packName))
          onDone()
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-8">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to items"
          className="text-foreground"
          onClick={onDone}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
        <h1 className="font-heading text-xl font-semibold">Repack</h1>
      </div>

      <ol className="flex gap-2 text-xs font-medium" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            className={cn(
              'flex-1 rounded-full px-2 py-1 text-center',
              step === index
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            What went into one pack?
          </h2>
          <p className="text-muted-foreground text-sm">
            Tap each item, then set how many pieces go in one pack.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Items">
            {ingredients.map((item) => {
              const source = sources.find((s) => s.itemId === item.id)
              return (
                <li
                  key={item.id}
                  className={cn(
                    'border-border flex items-center gap-3 rounded-xl border p-3',
                    source ? 'border-primary bg-accent' : 'bg-card',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={source !== undefined}
                    className="text-foreground flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => toggleSource(item.id)}
                  >
                    <TypeDot type={item.type} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatCents(item.costPerPieceCents)} a piece
                      </span>
                    </span>
                  </button>
                  {source && (
                    <Stepper
                      label={`${item.name} per pack`}
                      value={source.perPack}
                      min={1}
                      onChange={(perPack) =>
                        setSources((prev) =>
                          prev.map((s) =>
                            s.itemId === item.id ? { ...s, perPack } : s,
                          ),
                        )
                      }
                    />
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-sm tabular-nums">
            One pack costs <strong>{formatCents(costPerPack)}</strong>
          </p>
          <Button
            size="lg"
            className="text-primary-foreground min-h-12"
            disabled={sources.length === 0}
            onClick={toMade}
          >
            Next
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            What did you make?
          </h2>
          <div className="flex flex-col gap-2">
            {packItems.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={packItemId === item.id}
                onClick={() => {
                  setPackItemId(item.id)
                  setNewItem(null)
                }}
                className={cn(
                  'border-border text-foreground flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left',
                  packItemId === item.id
                    ? 'border-primary bg-accent'
                    : 'bg-card',
                )}
              >
                <TypeDot type={item.type} />
                <span className="flex-1 font-medium">{itemName(item)}</span>
                <span className="text-muted-foreground text-sm">
                  {priceLabel(item.priceCents, item.bundleSize)}
                </span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={newItem !== null}
              onClick={startNewItem}
              className={cn(
                'border-border text-foreground flex min-h-12 items-center gap-2 rounded-xl border border-dashed p-3',
                newItem && 'border-primary bg-accent border-solid',
              )}
            >
              <Plus className="size-5" aria-hidden="true" /> New item
            </button>
          </div>

          {newItem && (
            <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
              <NewItemFields
                id="repack"
                context="for the new item"
                placeholder="e.g. Candy pack"
                existingNames={items.map((item) => item.name)}
                value={newItem}
                onChange={(change) => setNewItem({ ...newItem, ...change })}
              />
              <fieldset className="flex flex-col gap-2">
                <legend className="text-muted-foreground pb-2 text-xs font-semibold tracking-wide uppercase">
                  Price
                </legend>
                <PriceOptionGrid
                  costPerPieceCents={costPerPack}
                  chosen={price}
                  onPick={setPrice}
                />
              </fieldset>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">How many packs?</span>
            <Stepper
              label="Packs made"
              value={packs}
              min={1}
              onChange={setPacks}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-foreground min-h-12 flex-1"
              onClick={() => setStep(0)}
            >
              Back
            </Button>
            <Button
              className="text-primary-foreground min-h-12 flex-1"
              disabled={!madeReady}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">Check and save</h2>
          <ul
            aria-label="Stock changes"
            className="border-border bg-card divide-border divide-y rounded-xl border"
          >
            {repackMoves(sources, packs ?? 0).map((move) => (
              <li
                key={move.itemId}
                className="flex items-center justify-between p-3 tabular-nums"
              >
                <span className="font-medium">
                  {items.find((item) => item.id === move.itemId)?.name}
                </span>
                <span className="font-heading text-foreground text-lg font-semibold">
                  {signedPieces(move.pieces)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between p-3 tabular-nums">
              <span className="font-medium">🎁 {packName}</span>
              <span className="font-heading text-ok text-lg font-semibold">
                {signedPieces(packs ?? 0)}
              </span>
            </li>
          </ul>

          {shortSources(sources, packs ?? 0, items).map((short) => (
            <p key={short.name} role="alert" className="text-warn text-sm">
              {short.name}: {short.needed} going in, but only {short.onRecord}{' '}
              on record. Check the numbers.
            </p>
          ))}

          <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
            <span>
              Costs <strong>{formatCents(costPerPack)}</strong> a pack
            </span>
            {sellsAt && (
              <span className="text-muted-foreground">
                · sells {priceLabel(sellsAt.priceCents, sellsAt.bundleSize)}
              </span>
            )}
            {margin !== null && (
              <>
                <span className="text-muted-foreground">
                  · {formatMargin(margin)}
                </span>
                <BandPill band={marginBand(margin)} />
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-foreground min-h-12 flex-1"
              disabled={repack.isPending}
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            <Button
              className="text-primary-foreground min-h-12 flex-1"
              disabled={repack.isPending}
              onClick={submit}
            >
              {repack.isPending ? 'Saving…' : 'Save repack'}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
