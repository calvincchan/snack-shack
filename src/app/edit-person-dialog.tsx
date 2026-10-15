import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  displayNameSchema,
  fullNameSchema,
  roleLabels,
  type Role,
} from '@/lib/people'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const schema = z.object({
  name: displayNameSchema,
  fullName: fullNameSchema,
  role: z.enum(['volunteer', 'admin', 'treasurer']),
})

export type PersonValues = z.infer<typeof schema>

/**
 * Edit a display name and full name, and the role when `showRole` is set.
 * Used for your own profile, a team member and an invite.
 */
export function EditPersonDialog({
  title,
  description,
  initial,
  showRole,
  saving,
  onSave,
  onClose,
}: {
  title: string
  description: string
  initial: PersonValues
  showRole: boolean
  saving: boolean
  onSave: (values: PersonValues) => void
  onClose: () => void
}) {
  const form = useForm<PersonValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  })
  const errors = form.formState.errors

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit(onSave)}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="person-name">Name</Label>
            <Input
              id="person-name"
              autoComplete="off"
              className="min-h-12"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
            {errors.name && (
              <p role="alert" className="text-destructive text-sm">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="person-full-name">Full name (optional)</Label>
            <Input
              id="person-full-name"
              autoComplete="off"
              className="min-h-12"
              aria-describedby="person-full-name-hint"
              aria-invalid={Boolean(errors.fullName)}
              {...form.register('fullName')}
            />
            <p
              id="person-full-name-hint"
              className="text-muted-foreground text-sm"
            >
              The name on their cheque. Shown in the claims email to the
              treasurer.
            </p>
            {errors.fullName && (
              <p role="alert" className="text-destructive text-sm">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {showRole && (
            <div className="flex flex-col gap-1.5">
              <Label id="person-role-label">Role</Label>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="person-role-label"
                    className="w-full"
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value as Role)
                    }}
                  >
                    {(['volunteer', 'admin'] as const).map((role) => (
                      <ToggleGroupItem
                        key={role}
                        value={role}
                        className="text-foreground min-h-12 flex-1"
                      >
                        {roleLabels[role]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="text-primary-foreground min-h-12"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
