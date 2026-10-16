import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Enums } from '@/lib/database.types'

export type NewItemDraft = {
  name: string
  type: Enums<'item_type'>
  storage: Enums<'storage_kind'>
}

/**
 * Name, type and storage for an item made on the spot: a new receipt line in
 * Log purchase, or the item made in Repack.
 */
export function NewItemFields({
  id,
  context,
  placeholder = 'e.g. Rice crackers',
  value,
  onChange,
}: {
  /** Unique per form, for the name input's id. */
  id: string
  /** Ends the toggle labels for screen readers: "for receipt line 1". */
  context?: string
  placeholder?: string
  value: NewItemDraft
  onChange: (change: Partial<NewItemDraft>) => void
}) {
  const suffix = context ? ` ${context}` : ''

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`name-${id}`}>Name kids will see</Label>
        <Input
          id={`name-${id}`}
          className="min-h-12"
          placeholder={placeholder}
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={`Type${suffix}`}
        className="w-full"
        value={value.type}
        onValueChange={(type) =>
          type && onChange({ type: type as NewItemDraft['type'] })
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
        aria-label={`Storage${suffix}`}
        className="w-full"
        value={value.storage}
        onValueChange={(storage) =>
          storage && onChange({ storage: storage as NewItemDraft['storage'] })
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
  )
}
