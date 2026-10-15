import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Stepper } from '@/components/stepper'
import { TypeDot } from '@/components/item-bits'
import { lastCountedLine, useSaveStockCount, type Item } from '@/lib/items'

const GROUPS = [
  { storage: 'shelf', title: 'Shelf' },
  { storage: 'freezer', title: '❄ Freezer' },
] as const

/**
 * Stock count (HANDOFF §4.4): every active item, Shelf then Freezer. A row is
 * blank until touched; skipped rows post nothing.
 */
export function CountStock({
  items,
  onDone,
}: {
  items: Item[]
  onDone: () => void
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const save = useSaveStockCount()
  const counted = Object.keys(counts).length

  function submit() {
    save.mutate(
      Object.entries(counts).map(([itemId, pieces]) => ({ itemId, pieces })),
      {
        onSuccess: (saved) => {
          toast.success(`Saved ${saved} ${saved === 1 ? 'item' : 'items'}`)
          onDone()
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
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
        <h1 className="font-heading text-xl font-semibold">Count stock</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Count what is on hand. Skip any item you don&apos;t count; it stays as
        it is.
      </p>

      {GROUPS.map(({ storage, title }) => {
        const group = items.filter((item) => item.storage === storage)
        if (group.length === 0) return null
        return (
          <section key={storage} className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <ul
              aria-label={title}
              className="border-border bg-card divide-border divide-y overflow-hidden rounded-xl border"
            >
              {group.map((item) => (
                <CountRow
                  key={item.id}
                  item={item}
                  value={counts[item.id]}
                  onChange={(pieces) =>
                    setCounts((prev) => ({ ...prev, [item.id]: pieces }))
                  }
                  onClear={() =>
                    setCounts((prev) =>
                      Object.fromEntries(
                        Object.entries(prev).filter(([id]) => id !== item.id),
                      ),
                    )
                  }
                />
              ))}
            </ul>
          </section>
        )
      })}

      <Button
        size="lg"
        className="text-primary-foreground min-h-12"
        disabled={counted === 0 || save.isPending}
        onClick={submit}
      >
        Save count
      </Button>
    </div>
  )
}

function CountRow({
  item,
  value,
  onChange,
  onClear,
}: {
  item: Item
  value: number | undefined
  onChange: (pieces: number) => void
  onClear: () => void
}) {
  const last = lastCountedLine(item)

  return (
    <li className="flex items-center gap-3 p-3">
      <TypeDot type={item.type} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{item.name}</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {last ?? 'Not counted yet'}
        </span>
      </div>
      {value === undefined ? (
        <Button
          variant="outline"
          className="text-foreground"
          aria-label={`Count ${item.name}`}
          onClick={() =>
            onChange((item.lastCountedPieces ?? 0) + item.boughtSince)
          }
        >
          Count
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Stepper label={item.name} value={value} onChange={onChange} />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-label={`Skip ${item.name}`}
            onClick={onClear}
          >
            Skip
          </Button>
        </div>
      )}
    </li>
  )
}
