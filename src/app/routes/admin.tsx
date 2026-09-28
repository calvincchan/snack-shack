import { useEffect } from 'react'
import { Link } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { centsToDollarString, dollarStringToCents } from '@/lib/money'
import type { Enums, Tables } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Role = Enums<'user_role'>
type Profile = Tables<'profiles'>
type Invite = Tables<'volunteer_invites'>

const roleLabels: Record<Role, string> = {
  volunteer: 'Volunteer',
  admin: 'Coordinator',
  treasurer: 'Treasurer',
}

/** Turn a Postgres error into something a volunteer can read. */
function say(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Something went wrong. Try again.'
}

export function AdminPage() {
  const { isCoordinator } = useAuth()

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" className="text-foreground">
          <Link to="/" aria-label="Back to sale day">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="font-heading text-xl font-semibold">
          Team and settings
        </h1>
      </div>

      {!isCoordinator ? (
        <p className="text-muted-foreground">
          Only the coordinator can open this screen. Ask them if something needs
          changing.
        </p>
      ) : (
        <Tabs defaultValue="team">
          <TabsList className="w-full">
            <TabsTrigger value="team" className="min-h-11 flex-1">
              Team
            </TabsTrigger>
            <TabsTrigger value="settings" className="min-h-11 flex-1">
              Settings
            </TabsTrigger>
          </TabsList>
          <TabsContent value="team" className="mt-4">
            <TeamSection />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsSection />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Team                                                                        */
/* -------------------------------------------------------------------------- */

const addSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email.')
    .email('That does not look like an email.'),
  name: z.string().trim().min(1, 'Enter a name.'),
  role: z.enum(['volunteer', 'admin', 'treasurer']),
})

type AddValues = z.infer<typeof addSchema>

function TeamSection() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  const people = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('active', { ascending: false })
        .order('display_name')
      if (error) throw error
      return data as Profile[]
    },
  })

  const invites = useQuery({
    queryKey: ['volunteer-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('volunteer_invites')
        .select('*')
        .is('accepted_at', null)
        .order('created_at')
      if (error) throw error
      return data as Invite[]
    },
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    void queryClient.invalidateQueries({ queryKey: ['volunteer-invites'] })
  }

  const form = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: { email: '', name: '', role: 'volunteer' },
  })

  const addVolunteer = useMutation({
    mutationFn: async (values: AddValues) => {
      const { data, error } = await supabase.rpc('add_volunteer', {
        p_email: values.email,
        p_name: values.name,
        p_role: values.role,
      })
      if (error) throw error
      return data as { status: 'added' | 'invited' }
    },
    onSuccess: (result, values) => {
      toast.success(
        result.status === 'added'
          ? `${values.name} is on the team.`
          : `${values.name} is invited. They join the team when they sign in.`,
      )
      form.reset({ email: '', name: '', role: values.role })
      refresh()
    },
    onError: (error) => toast.error(say(error)),
  })

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (error) => toast.error(say(error)),
  })

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('volunteer_invites')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (error) => toast.error(say(error)),
  })

  const onTeam = (people.data ?? []).filter((p) => p.active)
  const offTeam = (people.data ?? []).filter((p) => !p.active)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a volunteer</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={form.handleSubmit((values) =>
              addVolunteer.mutate(values),
            )}
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                className="min-h-12"
                aria-invalid={Boolean(form.formState.errors.email)}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p role="alert" className="text-destructive text-sm">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                autoComplete="off"
                className="min-h-12"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p role="alert" className="text-destructive text-sm">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label id="add-role-label">Role</Label>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="add-role-label"
                    className="w-full"
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value as Role)
                    }}
                  >
                    {(['volunteer', 'admin', 'treasurer'] as const).map(
                      (role) => (
                        <ToggleGroupItem
                          key={role}
                          value={role}
                          className="text-foreground min-h-12 flex-1"
                        >
                          {roleLabels[role]}
                        </ToggleGroupItem>
                      ),
                    )}
                  </ToggleGroup>
                )}
              />
            </div>

            <Button
              type="submit"
              disabled={addVolunteer.isPending}
              className="text-primary-foreground min-h-12"
            >
              {addVolunteer.isPending ? 'Adding…' : 'Add to the team'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">On the team</h2>
        {people.isPending && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {onTeam.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            isYou={person.id === profile?.id}
            busy={setActive.isPending}
            onToggle={() => setActive.mutate({ id: person.id, active: false })}
          />
        ))}
      </section>

      {invites.data && invites.data.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">
            Waiting to sign in
          </h2>
          {invites.data.map((invite) => (
            <div
              key={invite.id}
              className="border-border bg-card flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{invite.display_name}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {invite.email}
                </p>
              </div>
              <Badge variant="secondary">{roleLabels[invite.role]}</Badge>
              <Button
                type="button"
                variant="ghost"
                className="text-foreground min-h-11"
                disabled={cancelInvite.isPending}
                onClick={() => cancelInvite.mutate(invite.id)}
              >
                Cancel
              </Button>
            </div>
          ))}
        </section>
      )}

      {offTeam.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-semibold">Off the team</h2>
          {offTeam.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isYou={person.id === profile?.id}
              busy={setActive.isPending}
              onToggle={() => setActive.mutate({ id: person.id, active: true })}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function PersonRow({
  person,
  isYou,
  busy,
  onToggle,
}: {
  person: Profile
  isYou: boolean
  busy: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-border bg-card flex items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {person.display_name}
          {isYou && (
            <span className="text-muted-foreground font-normal"> (you)</span>
          )}
        </p>
        <p className="text-muted-foreground truncate text-sm">{person.email}</p>
      </div>
      <Badge variant={person.role === 'admin' ? 'default' : 'secondary'}>
        {roleLabels[person.role]}
      </Badge>
      {!isYou && (
        <Button
          type="button"
          variant="ghost"
          className="text-foreground min-h-11"
          disabled={busy}
          onClick={onToggle}
        >
          {person.active ? 'Remove' : 'Add back'}
        </Button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

const settingsSchema = z.object({
  float: z
    .string()
    .refine((v) => Number.isFinite(dollarStringToCents(v)), 'Enter an amount.'),
  target_sale_days: z.coerce.number().int().min(1, 'At least 1 sale day.'),
  over_short_ok: z
    .string()
    .refine((v) => Number.isFinite(dollarStringToCents(v)), 'Enter an amount.'),
  over_short_warn: z
    .string()
    .refine((v) => Number.isFinite(dollarStringToCents(v)), 'Enter an amount.'),
  gst_percent: z.coerce
    .number()
    .min(0, 'Cannot be negative.')
    .max(100, 'Too big.'),
  max_items_per_kid: z.coerce.number().int().min(1, 'At least 1 item.'),
  max_treats_per_kid: z.coerce.number().int().min(0, 'Cannot be negative.'),
  treasurer_email: z.union([
    z.literal(''),
    z.string().email('That does not look like an email.'),
  ]),
})

type SettingsValues = z.input<typeof settingsSchema>

function SettingsSection() {
  const queryClient = useQueryClient()

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single()
      if (error) throw error
      return data
    },
  })

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
  })
  const { reset } = form

  useEffect(() => {
    if (!settings.data) return
    reset({
      float: centsToDollarString(settings.data.float_cents),
      target_sale_days: settings.data.target_sale_days,
      over_short_ok: centsToDollarString(settings.data.over_short_ok_cents),
      over_short_warn: centsToDollarString(settings.data.over_short_warn_cents),
      gst_percent: Number(settings.data.gst_rate) * 100,
      max_items_per_kid: settings.data.max_items_per_kid,
      max_treats_per_kid: settings.data.max_treats_per_kid,
      treasurer_email: settings.data.treasurer_email ?? '',
    })
  }, [settings.data, reset])

  const save = useMutation({
    mutationFn: async (values: SettingsValues) => {
      const parsed = settingsSchema.parse(values)
      const { error } = await supabase
        .from('settings')
        .update({
          float_cents: dollarStringToCents(parsed.float),
          target_sale_days: parsed.target_sale_days,
          over_short_ok_cents: dollarStringToCents(parsed.over_short_ok),
          over_short_warn_cents: dollarStringToCents(parsed.over_short_warn),
          gst_rate: parsed.gst_percent / 100,
          max_items_per_kid: parsed.max_items_per_kid,
          max_treats_per_kid: parsed.max_treats_per_kid,
          treasurer_email:
            parsed.treasurer_email === '' ? null : parsed.treasurer_email,
        })
        .eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Settings saved.')
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => toast.error(say(error)),
  })

  if (settings.isPending)
    return <p className="text-muted-foreground text-sm">Loading…</p>

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      noValidate
    >
      <Field
        id="float"
        label="Change float"
        hint="Cash left in the box for making change."
        prefix="$"
        error={form.formState.errors.float?.message}
        {...form.register('float')}
      />
      <Field
        id="target_sale_days"
        label="Target stock, in sale days"
        hint="How much stock to keep on hand."
        type="number"
        error={form.formState.errors.target_sale_days?.message}
        {...form.register('target_sale_days')}
      />
      <Field
        id="over_short_ok"
        label="Over/short still fine"
        hint="Anything inside this counts as a good count up."
        prefix="$"
        error={form.formState.errors.over_short_ok?.message}
        {...form.register('over_short_ok')}
      />
      <Field
        id="over_short_warn"
        label="Over/short worth a recount"
        hint="Past this, the count up is flagged."
        prefix="$"
        error={form.formState.errors.over_short_warn?.message}
        {...form.register('over_short_warn')}
      />
      <Field
        id="gst_percent"
        label="GST rate"
        hint="Used by Deal check."
        type="number"
        step="0.1"
        suffix="%"
        error={form.formState.errors.gst_percent?.message}
        {...form.register('gst_percent')}
      />
      <Field
        id="max_items_per_kid"
        label="Items a kid can buy"
        type="number"
        error={form.formState.errors.max_items_per_kid?.message}
        {...form.register('max_items_per_kid')}
      />
      <Field
        id="max_treats_per_kid"
        label="Treats a kid can buy"
        type="number"
        error={form.formState.errors.max_treats_per_kid?.message}
        {...form.register('max_treats_per_kid')}
      />
      <Field
        id="treasurer_email"
        label="Treasurer email"
        hint="Where the weekly email goes."
        type="email"
        error={form.formState.errors.treasurer_email?.message}
        {...form.register('treasurer_email')}
      />

      <Button
        type="submit"
        disabled={save.isPending}
        className="text-primary-foreground min-h-12"
      >
        {save.isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  prefix,
  suffix,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string
  label: string
  hint?: string
  error?: string
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      <div className="flex items-center gap-2">
        {prefix && <span className="text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          inputMode={props.type === 'number' ? 'decimal' : undefined}
          className="min-h-12 tabular-nums"
          aria-invalid={Boolean(error)}
          {...props}
        />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
