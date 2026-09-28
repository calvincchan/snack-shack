import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from 'cn'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ItemChangedError,
  useSaveItem,
  useSetArchived,
  type Item,
  type ItemEdit,
  type OpenSaleDay,
} from '@/lib/items'
import { formatMargin, priceLabel, priceOptions } from '@/lib/pricing'
import { timeAgo } from '@/lib/time'

function editOf(item: Item): ItemEdit {
  return {
    name: item.name,
    type: item.type,
    storage: item.storage,
    priceCents: item.priceCents,
    bundleSize: item.bundleSize,
  }
}

export function ItemEditor({
  item,
  saleDay,
  onClose,
}: {
  item: Item | null
  saleDay: OpenSaleDay | null
  onClose: () => void
}) {
  // Mounted with `key={item.id}`, so the draft starts from the item it opened
  // on and later refetches do not overwrite what the volunteer is typing.
  const [edit, setEdit] = useState<ItemEdit | null>(() =>
    item ? editOf(item) : null,
  )
  const [conflict, setConflict] = useState<{
    mine: ItemEdit
    theirs: Item
  } | null>(null)
  const save = useSaveItem()
  const archive = useSetArchived()

  if (!item || !edit) return null

  const locked = saleDay?.locked[item.id]
  const sellingNow = saleDay !== null && saleDay.phase !== 'lineup'

  function apply(values: ItemEdit, version: number) {
    save.mutate(
      { id: item!.id, version, edit: values },
      {
        onSuccess: () => {
          toast.success(`${values.name} saved.`)
          onClose()
        },
        onError: (error) => {
          if (error instanceof ItemChangedError) {
            setConflict({ mine: values, theirs: error.current })
          } else {
            toast.error(error.message)
          }
        },
      },
    )
  }

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] gap-4 overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{item.name}</SheetTitle>
            <SheetDescription>
              {item.onHand} on hand ·{' '}
              {priceLabel(item.priceCents, item.bundleSize)}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 pb-6">
            {sellingNow && (
              <p className="bg-accent text-accent-foreground rounded-lg p-3 text-sm">
                Prices and types are locked for today. Changes apply from the
                next sale day.
              </p>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="text-muted-foreground pb-2 text-xs font-semibold tracking-wide uppercase">
                Price
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {priceOptions(item.costPerPieceCents).map((option) => {
                  const chosen =
                    edit.priceCents === option.priceCents &&
                    edit.bundleSize === option.bundleSize
                  return (
                    <button
                      key={`${option.priceCents}-${option.bundleSize}`}
                      type="button"
                      aria-pressed={chosen}
                      onClick={() =>
                        setEdit({
                          ...edit,
                          priceCents: option.priceCents,
                          bundleSize: option.bundleSize,
                        })
                      }
                      className={cn(
                        'border-border text-foreground bg-card flex min-h-16 flex-col items-start gap-1 rounded-lg border p-3 text-left',
                        chosen && 'border-primary ring-primary ring-2',
                      )}
                    >
                      <span className="flex w-full items-baseline justify-between gap-2">
                        <span className="font-heading text-lg font-semibold">
                          {priceLabel(option.priceCents, option.bundleSize)}
                        </span>
                        {option.suggested && (
                          <span className="text-ok text-xs font-semibold tracking-wide uppercase">
                            Suggested
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {option.band.label} · {formatMargin(option.margin)}{' '}
                        margin
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label
                id="edit-type"
                className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Type
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="edit-type"
                className="w-full"
                value={edit.type}
                onValueChange={(value) =>
                  value && setEdit({ ...edit, type: value as Item['type'] })
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
            </div>

            <div className="flex flex-col gap-2">
              <Label
                id="edit-storage"
                className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Storage
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="edit-storage"
                className="w-full"
                value={edit.storage}
                onValueChange={(value) =>
                  value &&
                  setEdit({ ...edit, storage: value as Item['storage'] })
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
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-name">Name kids see</Label>
              <Input
                id="edit-name"
                className="min-h-12"
                value={edit.name}
                onChange={(event) =>
                  setEdit({ ...edit, name: event.target.value })
                }
              />
            </div>

            {locked && sellingNow && (
              <p className="text-muted-foreground text-sm">
                Today this is{' '}
                {priceLabel(locked.priceCents, locked.bundleSize ?? 1)} and a{' '}
                {locked.type === 'treat' ? 'treat' : 'snack'}.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="text-primary-foreground min-h-12"
                disabled={save.isPending || edit.name.trim() === ''}
                onClick={() =>
                  apply({ ...edit, name: edit.name.trim() }, item.version)
                }
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-foreground min-h-12"
                disabled={archive.isPending}
                onClick={() =>
                  archive.mutate(
                    { id: item.id, archived: !item.archived },
                    {
                      onSuccess: () => {
                        toast.success(
                          item.archived
                            ? `${item.name} is back on the list.`
                            : `${item.name} is archived. It won't show up in a lineup.`,
                        )
                        onClose()
                      },
                      onError: (error) => toast.error(error.message),
                    },
                  )
                }
              >
                {item.archived ? 'Put back on the list' : 'Archive this item'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {conflict && (
        <ConflictPrompt
          conflict={conflict}
          busy={save.isPending}
          onKeepMine={() => {
            const mine = conflict.mine
            const version = conflict.theirs.version
            setConflict(null)
            apply(mine, version)
          }}
          onKeepTheirs={() => {
            setConflict(null)
            onClose()
          }}
        />
      )}
    </>
  )
}

function ConflictPrompt({
  conflict,
  busy,
  onKeepMine,
  onKeepTheirs,
}: {
  conflict: { mine: ItemEdit; theirs: Item }
  busy: boolean
  onKeepMine: () => void
  onKeepTheirs: () => void
}) {
  const { mine, theirs } = conflict
  const who = theirs.updatedByName ?? 'Someone'
  const when = theirs.updatedAt ? timeAgo(theirs.updatedAt) : 'just now'

  return (
    <Dialog open onOpenChange={(open) => !open && onKeepTheirs()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {who} changed this to{' '}
            {priceLabel(theirs.priceCents, theirs.bundleSize)} {when}.
          </DialogTitle>
          <DialogDescription>
            Keep yours or {who === 'Someone' ? 'theirs' : `${who}'s`}? Nothing
            is saved over without you saying so.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={busy}
            className="text-primary-foreground min-h-12 w-full"
            onClick={onKeepMine}
          >
            Keep mine ({priceLabel(mine.priceCents, mine.bundleSize)})
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-foreground min-h-12 w-full"
            onClick={onKeepTheirs}
          >
            Keep {who === 'Someone' ? 'theirs' : `${who}'s`} (
            {priceLabel(theirs.priceCents, theirs.bundleSize)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
