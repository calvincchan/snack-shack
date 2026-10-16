// PROTOTYPE (issue #85): three variants of the Repack screen, switchable via
// ?variant=A|B|C on /items. Reads real items; Save is a stub (no writes).
// Peach Slices and Sour Keys Gummy are faked in if the local DB lacks them.
// Throwaway: lives on the prototype/repack branch only.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, Plus, Trash2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Stepper } from '@/components/stepper'
import { BandPill, Tag, TypeDot } from '@/components/item-bits'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PrototypeSwitcher } from '@/components/prototype-switcher'
import { stockLine, type Item } from '@/lib/items'
import { formatCents } from '@/lib/money'
import {
  PRICE_OPTIONS,
  formatMargin,
  marginBand,
  marginOf,
  priceLabel,
} from '@/lib/pricing'

// ---------- shared model (not layout) ----------

type NewPack = {
  name: string
  type: Item['type']
  storage: Item['storage']
  priceCents: number
  bundleSize: number
}

type Source = { itemId: string; perPack: number }

type Draft = {
  packId: string | null // existing pack item
  newPack: NewPack | null // or a new one
  packs: number | null
  sources: Source[]
}

const NEW_ID = '__new__'

const emptyDraft: Draft = {
  packId: null,
  newPack: null,
  packs: null,
  sources: [],
}

function fake(name: string, cost: number, onHand: number): Item {
  return {
    id: `fake-${name}`,
    name,
    type: 'treat',
    storage: 'shelf',
    priceCents: null,
    bundleSize: 1,
    costPerPieceCents: cost,
    onHand,
    lastCountedAt: null,
    lastCountedPieces: null,
    boughtSince: onHand,
    piecesGone: null,
    isNew: true,
    archived: false,
    version: 1,
    lastBoughtBy: null,
    updatedByName: null,
    updatedAt: null,
  }
}

function withFixtures(items: Item[]): Item[] {
  const has = (n: string) => items.some((i) => i.name === n)
  const extra: Item[] = []
  if (!has('Peach Slices')) extra.push(fake('Peach Slices', 4.2, 250))
  if (!has('Sour Keys Gummy')) extra.push(fake('Sour Keys Gummy', 18, 60))
  return [...items, ...extra]
}

function useMaths(draft: Draft, items: Item[]) {
  const byId = (id: string) => items.find((i) => i.id === id)
  const pack = draft.packId ? byId(draft.packId) : undefined
  const costPerPack = draft.sources.reduce(
    (sum, s) => sum + s.perPack * (byId(s.itemId)?.costPerPieceCents ?? 0),
    0,
  )
  const priceCents = draft.newPack?.priceCents ?? pack?.priceCents ?? null
  const bundleSize = draft.newPack?.bundleSize ?? pack?.bundleSize ?? 1
  const margin =
    priceCents !== null && draft.sources.length > 0
      ? marginOf(costPerPack, priceCents, bundleSize)
      : null
  const packName = draft.newPack?.name || pack?.name || 'pack'
  const ready =
    (pack !== undefined || (draft.newPack?.name.trim() ?? '') !== '') &&
    (draft.packs ?? 0) > 0 &&
    draft.sources.length > 0
  return {
    byId,
    pack,
    costPerPack,
    priceCents,
    bundleSize,
    margin,
    packName,
    ready,
  }
}

function blankNewPack(): NewPack {
  return {
    name: '',
    type: 'treat',
    storage: 'shelf',
    priceCents: 200,
    bundleSize: 1,
  }
}

// ---------- entry ----------

const VARIANTS = [
  { key: 'A', name: 'One form' },
  { key: 'B', name: 'Steps' },
  { key: 'C', name: 'Sentence' },
]

export function RepackPrototype({
  items: realItems,
  onDone,
}: {
  items: Item[]
  onDone: () => void
}) {
  const [params] = useSearchParams()
  const variant = params.get('variant') ?? 'A'
  const items = useMemo(() => withFixtures(realItems), [realItems])
  const [saved, setSaved] = useState<Draft | null>(null)

  function save(draft: Draft) {
    toast.success(
      `Repacked ${draft.packs} ${draft.newPack?.name || items.find((i) => i.id === draft.packId)?.name}`,
    )
    setSaved(draft)
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-40">
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

      {saved ? (
        <AfterSave
          draft={saved}
          items={items}
          onAgain={() => setSaved(null)}
          onDone={onDone}
        />
      ) : (
        <>
          {variant === 'A' && <VariantA key="A" items={items} onSave={save} />}
          {variant === 'B' && <VariantB key="B" items={items} onSave={save} />}
          {variant === 'C' && <VariantC key="C" items={items} onSave={save} />}
        </>
      )}

      <PrototypeSwitcher variants={VARIANTS} />
    </div>
  )
}

// ---------- shared bits ----------

function NewPackFields({
  value,
  costPerPack,
  onChange,
}: {
  value: NewPack
  costPerPack: number
  onChange: (next: NewPack) => void
}) {
  const seg = (active: boolean) =>
    cn(
      'border-border min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium',
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-card text-foreground',
    )
  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Name kids see, e.g. Candy pack"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        className="h-11"
      />
      <div className="flex gap-2">
        {(['snack', 'treat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={seg(value.type === t)}
            onClick={() => onChange({ ...value, type: t })}
          >
            {t === 'snack' ? 'Snack' : 'Treat'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {(['shelf', 'freezer'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={seg(value.storage === s)}
            onClick={() => onChange({ ...value, storage: s })}
          >
            {s === 'shelf' ? 'Shelf' : '❄ Freezer'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PRICE_OPTIONS.map((o) => {
          const m = marginOf(costPerPack, o.priceCents, o.bundleSize)
          const active =
            value.priceCents === o.priceCents &&
            value.bundleSize === o.bundleSize
          return (
            <button
              key={`${o.priceCents}-${o.bundleSize}`}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  priceCents: o.priceCents,
                  bundleSize: o.bundleSize,
                })
              }
              className={cn(
                'border-border flex min-h-14 flex-col items-start rounded-lg border p-2 text-left',
                active
                  ? 'border-primary bg-accent text-foreground'
                  : 'bg-card text-foreground',
              )}
            >
              <span className="font-heading font-semibold">
                {priceLabel(o.priceCents, o.bundleSize)}
              </span>
              {costPerPack > 0 && (
                <span className="text-muted-foreground text-xs">
                  {marginBand(m).label} · {formatMargin(m)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CostLine({
  costPerPack,
  priceCents,
  bundleSize,
  margin,
}: {
  costPerPack: number
  priceCents: number | null
  bundleSize: number
  margin: number | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
      <span>
        Costs <strong>{formatCents(costPerPack)}</strong> a pack
      </span>
      {priceCents !== null && (
        <span className="text-muted-foreground">
          · sells {priceLabel(priceCents, bundleSize)}
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
  )
}

function moves(draft: Draft, m: ReturnType<typeof useMaths>) {
  const packs = draft.packs ?? 0
  return [
    ...draft.sources.map((s) => ({
      name: m.byId(s.itemId)?.name ?? '?',
      qty: -packs * s.perPack,
    })),
    { name: m.packName, qty: packs },
  ]
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)

// ---------- Variant A: one form, sticky summary ----------

function VariantA({
  items,
  onSave,
}: {
  items: Item[]
  onSave: (d: Draft) => void
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const m = useMaths(draft, items)
  const sourceIds = draft.sources.map((s) => s.itemId)
  const addable = items.filter(
    (i) => !i.archived && i.id !== draft.packId && !sourceIds.includes(i.id),
  )

  return (
    <>
      <p className="text-muted-foreground text-sm">
        Made a new item out of other items? Record it here so stock and cost
        move over.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Pack item</h2>
        <select
          className="border-border bg-card text-foreground h-11 rounded-lg border px-3"
          value={draft.newPack ? NEW_ID : (draft.packId ?? '')}
          onChange={(e) => {
            const v = e.target.value
            setDraft((d) =>
              v === NEW_ID
                ? { ...d, packId: null, newPack: blankNewPack() }
                : { ...d, packId: v || null, newPack: null },
            )
          }}
        >
          <option value="">Choose…</option>
          <option value={NEW_ID}>+ New item</option>
          {items
            .filter((i) => !i.archived && !sourceIds.includes(i.id))
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
        {draft.newPack && (
          <NewPackFields
            value={draft.newPack}
            costPerPack={m.costPerPack}
            onChange={(newPack) => setDraft((d) => ({ ...d, newPack }))}
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">In one pack</h2>
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {draft.sources.map((s) => {
            const item = m.byId(s.itemId)!
            return (
              <li key={s.itemId} className="flex items-center gap-3 p-3">
                <TypeDot type={item.type} />
                <span className="min-w-0 flex-1 font-medium">{item.name}</span>
                <Stepper
                  label={`${item.name} per pack`}
                  value={s.perPack}
                  min={1}
                  onChange={(perPack) =>
                    setDraft((d) => ({
                      ...d,
                      sources: d.sources.map((x) =>
                        x.itemId === s.itemId ? { ...x, perPack } : x,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  className="text-muted-foreground flex size-11 items-center justify-center"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      sources: d.sources.filter((x) => x.itemId !== s.itemId),
                    }))
                  }
                >
                  <Trash2 className="size-5" />
                </button>
              </li>
            )
          })}
          <li className="p-3">
            <select
              className="border-border bg-card text-foreground h-11 w-full rounded-lg border px-3"
              value=""
              onChange={(e) =>
                e.target.value &&
                setDraft((d) => ({
                  ...d,
                  sources: [
                    ...d.sources,
                    { itemId: e.target.value, perPack: 1 },
                  ],
                }))
              }
            >
              <option value="">+ Add an item</option>
              {addable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </li>
        </ul>
      </section>

      <section className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">Packs made</h2>
        <Stepper
          label="Packs made"
          value={draft.packs}
          min={1}
          onChange={(packs) => setDraft((d) => ({ ...d, packs }))}
        />
      </section>

      <div className="border-border bg-background fixed inset-x-0 bottom-16 z-50 flex flex-col gap-2 border-t p-4 pb-16">
        <CostLine {...m} />
        <Button
          size="lg"
          className="text-primary-foreground min-h-12"
          disabled={!m.ready}
          onClick={() => onSave(draft)}
        >
          Save repack
        </Button>
      </div>
    </>
  )
}

// ---------- Variant B: three steps, review with stock moves ----------

function VariantB({
  items,
  onSave,
}: {
  items: Item[]
  onSave: (d: Draft) => void
}) {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const m = useMaths(draft, items)
  const active = items.filter((i) => !i.archived)
  const toggleSource = (id: string) =>
    setDraft((d) => ({
      ...d,
      sources: d.sources.some((s) => s.itemId === id)
        ? d.sources.filter((s) => s.itemId !== id)
        : [...d.sources, { itemId: id, perPack: 1 }],
    }))

  return (
    <>
      <ol className="flex gap-2 text-xs font-medium">
        {['What went in', 'What you made', 'Check'].map((label, i) => (
          <li
            key={label}
            className={cn(
              'flex-1 rounded-full px-2 py-1 text-center',
              step === i + 1
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            What went into one pack?
          </h2>
          <p className="text-muted-foreground text-sm">
            Tap each item, then set how many pieces go in one pack.
          </p>
          <ul className="flex flex-col gap-2">
            {active.map((i) => {
              const s = draft.sources.find((x) => x.itemId === i.id)
              return (
                <li
                  key={i.id}
                  className={cn(
                    'border-border flex items-center gap-3 rounded-xl border p-3',
                    s ? 'border-primary bg-accent' : 'bg-card',
                  )}
                >
                  <button
                    type="button"
                    className="text-foreground flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => toggleSource(i.id)}
                  >
                    <TypeDot type={i.type} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{i.name}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatCents(i.costPerPieceCents)} a piece
                      </span>
                    </span>
                  </button>
                  {s && (
                    <Stepper
                      label={`${i.name} per pack`}
                      value={s.perPack}
                      min={1}
                      onChange={(perPack) =>
                        setDraft((d) => ({
                          ...d,
                          sources: d.sources.map((x) =>
                            x.itemId === i.id ? { ...x, perPack } : x,
                          ),
                        }))
                      }
                    />
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-sm tabular-nums">
            One pack costs <strong>{formatCents(m.costPerPack)}</strong>
          </p>
          <Button
            size="lg"
            className="text-primary-foreground min-h-12"
            disabled={draft.sources.length === 0}
            onClick={() => setStep(2)}
          >
            Next
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">
            What did you make?
          </h2>
          <div className="flex flex-col gap-2">
            {active
              .filter((i) => !draft.sources.some((s) => s.itemId === i.id))
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, packId: i.id, newPack: null }))
                  }
                  className={cn(
                    'border-border text-foreground flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left',
                    draft.packId === i.id
                      ? 'border-primary bg-accent'
                      : 'bg-card',
                  )}
                >
                  <TypeDot type={i.type} />
                  <span className="flex-1 font-medium">{i.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {priceLabel(i.priceCents, i.bundleSize)}
                  </span>
                </button>
              ))}
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  packId: null,
                  newPack: d.newPack ?? blankNewPack(),
                }))
              }
              className={cn(
                'border-border text-foreground flex min-h-12 items-center gap-2 rounded-xl border border-dashed p-3',
                draft.newPack && 'border-primary bg-accent border-solid',
              )}
            >
              <Plus className="size-5" /> New item
            </button>
          </div>
          {draft.newPack && (
            <NewPackFields
              value={draft.newPack}
              costPerPack={m.costPerPack}
              onChange={(newPack) => setDraft((d) => ({ ...d, newPack }))}
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">How many packs?</span>
            <Stepper
              label="Packs made"
              value={draft.packs}
              min={1}
              onChange={(packs) => setDraft((d) => ({ ...d, packs }))}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-foreground min-h-12 flex-1"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            <Button
              className="text-primary-foreground min-h-12 flex-1"
              disabled={!m.ready}
              onClick={() => setStep(3)}
            >
              Next
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">Check and save</h2>
          <ul className="border-border bg-card divide-border divide-y rounded-xl border">
            {moves(draft, m).map((mv) => (
              <li
                key={mv.name}
                className="flex items-center justify-between p-3 tabular-nums"
              >
                <span className="font-medium">{mv.name}</span>
                <span
                  className={cn(
                    'font-heading text-lg font-semibold',
                    mv.qty > 0 ? 'text-ok' : 'text-foreground',
                  )}
                >
                  {signed(mv.qty)}
                </span>
              </li>
            ))}
          </ul>
          <CostLine {...m} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-foreground min-h-12 flex-1"
              onClick={() => setStep(2)}
            >
              Back
            </Button>
            <Button
              className="text-primary-foreground min-h-12 flex-1"
              onClick={() => onSave(draft)}
            >
              Save repack
            </Button>
          </div>
        </section>
      )}
    </>
  )
}

// ---------- Variant C: one sentence, sheets for each blank ----------

type Sheet_ = 'pack' | 'add' | null

function VariantC({
  items,
  onSave,
}: {
  items: Item[]
  onSave: (d: Draft) => void
}) {
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft, packs: 1 })
  const [sheet, setSheet] = useState<Sheet_>(null)
  const m = useMaths(draft, items)
  const active = items.filter((i) => !i.archived)
  const token =
    'border-primary text-foreground bg-accent inline-flex min-h-11 items-center rounded-lg border-2 border-dashed px-3 font-semibold'

  return (
    <>
      <div className="font-heading flex flex-col gap-4 text-xl leading-relaxed">
        <div className="flex flex-wrap items-center gap-2">
          <span>We made</span>
          <Stepper
            label="Packs made"
            value={draft.packs}
            min={1}
            onChange={(packs) => setDraft((d) => ({ ...d, packs }))}
          />
          <button
            type="button"
            className={token}
            onClick={() => setSheet('pack')}
          >
            {draft.newPack?.name || m.pack?.name || 'which item?'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>Each one has</span>
        </div>
        <ul className="flex flex-col gap-2 text-base">
          {draft.sources.map((s) => {
            const item = m.byId(s.itemId)!
            return (
              <li key={s.itemId} className="flex items-center gap-2">
                <Stepper
                  label={`${item.name} per pack`}
                  value={s.perPack}
                  min={0}
                  onChange={(perPack) =>
                    setDraft((d) => ({
                      ...d,
                      sources:
                        perPack === 0
                          ? d.sources.filter((x) => x.itemId !== s.itemId)
                          : d.sources.map((x) =>
                              x.itemId === s.itemId ? { ...x, perPack } : x,
                            ),
                    }))
                  }
                />
                <span className="font-medium">{item.name}</span>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              className={token}
              onClick={() => setSheet('add')}
            >
              <Plus className="mr-1 size-5" /> add an item
            </button>
          </li>
        </ul>
      </div>

      {draft.newPack && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            New item
          </h2>
          <NewPackFields
            value={draft.newPack}
            costPerPack={m.costPerPack}
            onChange={(newPack) => setDraft((d) => ({ ...d, newPack }))}
          />
        </section>
      )}

      {draft.sources.length > 0 && (
        <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
          <CostLine {...m} />
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="font-normal">Item</th>
                <th className="text-right font-normal">On hand</th>
                <th className="text-right font-normal">After</th>
              </tr>
            </thead>
            <tbody>
              {moves(draft, m).map((mv) => {
                const before =
                  (draft.packId === null && mv.name === m.packName
                    ? 0
                    : items.find((i) => i.name === mv.name)?.onHand) ?? 0
                return (
                  <tr key={mv.name}>
                    <td className="py-1">{mv.name}</td>
                    <td className="text-right">{before}</td>
                    <td className="text-right font-semibold">
                      {before + mv.qty}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({signed(mv.qty)})
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <Button
        size="lg"
        className="text-primary-foreground min-h-12"
        disabled={!m.ready}
        onClick={() => onSave(draft)}
      >
        Save repack
      </Button>

      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {sheet === 'pack' ? 'What did you make?' : 'What went in?'}
            </SheetTitle>
          </SheetHeader>
          <ul className="divide-border divide-y px-4 pb-6">
            {sheet === 'pack' && (
              <li>
                <button
                  type="button"
                  className="text-foreground flex min-h-12 w-full items-center gap-2"
                  onClick={() => {
                    setDraft((d) => ({
                      ...d,
                      packId: null,
                      newPack: blankNewPack(),
                    }))
                    setSheet(null)
                  }}
                >
                  <Plus className="size-5" /> New item
                </button>
              </li>
            )}
            {active
              .filter(
                (i) =>
                  !draft.sources.some((s) => s.itemId === i.id) &&
                  !(sheet === 'add' && i.id === draft.packId),
              )
              .map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="text-foreground flex min-h-12 w-full items-center gap-3 text-left"
                    onClick={() => {
                      setDraft((d) =>
                        sheet === 'pack'
                          ? { ...d, packId: i.id, newPack: null }
                          : {
                              ...d,
                              sources: [
                                ...d.sources,
                                { itemId: i.id, perPack: 1 },
                              ],
                            },
                      )
                      setSheet(null)
                    }}
                  >
                    <TypeDot type={i.type} />
                    <span className="flex-1">{i.name}</span>
                    <ChevronRight className="text-muted-foreground size-4" />
                  </button>
                </li>
              ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ---------- after save: what Items would show (shared) ----------

function AfterSave({
  draft,
  items,
  onAgain,
  onDone,
}: {
  draft: Draft
  items: Item[]
  onAgain: () => void
  onDone: () => void
}) {
  const m = useMaths(draft, items)
  const [repackOnly, setRepackOnly] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      draft.sources.map((s) => [
        s.itemId,
        m.byId(s.itemId)?.priceCents === null,
      ]),
    ),
  )
  const packs = draft.packs ?? 0

  return (
    <section className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Prototype: nothing was saved. This is how the Items tab would look.
      </p>
      <ul className="border-border bg-card divide-border divide-y rounded-xl border">
        <li className="flex flex-col gap-1 p-3">
          <span className="flex items-center gap-2 font-medium">
            <TypeDot type={draft.newPack?.type ?? m.pack?.type ?? 'treat'} />
            {m.packName}
            {draft.newPack && <Tag>New</Tag>}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {stockLine({
              lastCountedAt: null,
              lastCountedPieces: null,
              boughtSince: m.pack?.boughtSince ?? 0,
            })}{' '}
            · repacked +{packs} · {formatCents(m.costPerPack)} a piece
          </span>
          {m.margin !== null && <BandPill band={marginBand(m.margin)} />}
        </li>
        {draft.sources.map((s) => {
          const item = m.byId(s.itemId)!
          const only = repackOnly[s.itemId]
          return (
            <li key={s.itemId} className="flex flex-col gap-2 p-3">
              <span className="flex items-center gap-2 font-medium">
                <TypeDot type={item.type} />
                {item.name}
                {only && <Tag>Repack only</Tag>}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {stockLine(item)} · repacked −{packs * s.perPack}
              </span>
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>
                  Repack only
                  <span className="text-muted-foreground block text-xs">
                    Not sold on its own. Needs no price.
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="accent-primary size-6"
                  checked={only}
                  onChange={(e) =>
                    setRepackOnly((r) => ({
                      ...r,
                      [s.itemId]: e.target.checked,
                    }))
                  }
                />
              </label>
              {!only && item.priceCents === null && (
                <span className="text-warn text-xs">
                  Still shows under Needs a price.
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="text-foreground min-h-12 flex-1"
          onClick={onAgain}
        >
          Try again
        </Button>
        <Button
          className="text-primary-foreground min-h-12 flex-1"
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </section>
  )
}
