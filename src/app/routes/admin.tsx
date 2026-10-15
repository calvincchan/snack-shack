import { useEffect, useState } from 'react'
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
import type { Tables } from '@/lib/database.types'
import {
  displayNameSchema,
  fullNameSchema,
  roleLabels,
  type Role,
} from '@/lib/people'
import { EditPersonDialog, type PersonValues } from '@/app/edit-person-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Profile = Tables<'profiles'>
type Invite = Tables<'volunteer_invites'>

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
  name: displayNameSchema,
  fullName: fullNameSchema,
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
    defaultValues: { email: '', name: '', fullName: '', role: 'volunteer' },
  })

  const addVolunteer = useMutation({
    mutationFn: async (values: AddValues) => {
      const { data, error } = await supabase.rpc('add_volunteer', {
        p_email: values.email,
        p_name: values.name,
        p_role: values.role,
        p_full_name: values.fullName || undefined,
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
      form.reset({ email: '', name: '', fullName: '', role: values.role })
      refresh()
    },
    onError: (error) => toast.error(say(error)),
  })

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc('set_member_active', {
        p_id: id,
        p_active: active,
      })
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
              <Label htmlFor="add-full-name">Full name (optional)</Label>
              <Input
                id="add-full-name"
                autoComplete="off"
                className="min-h-12"
                aria-describedby="add-full-name-hint"
                {...form.register('fullName')}
              />
              <p
                id="add-full-name-hint"
                className="text-muted-foreground text-sm"
              >
                The name on their bank account, for the treasurer email.
              </p>
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
            <InviteRow
              key={invite.id}
              invite={invite}
              busy={cancelInvite.isPending}
              onCancel={() => cancelInvite.mutate(invite.id)}
            />
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
  const [editing, setEditing] = useState(false)

  return (
    <div className="border-border bg-card flex items-center gap-3 rounded-lg border p-3">
      <button
        type="button"
        className="text-foreground min-h-11 min-w-0 flex-1 text-left"
        aria-label={`Edit ${person.display_name}`}
        onClick={() => setEditing(true)}
      >
        <p className="truncate font-medium">
          {person.display_name}
          {isYou && (
            <span className="text-muted-foreground font-normal"> (you)</span>
          )}
        </p>
        <p
          className={
            person.full_name
              ? 'text-muted-foreground truncate text-sm'
              : 'text-primary truncate text-sm underline'
          }
        >
          {person.full_name ?? 'Add full name'}
        </p>
        <p className="text-muted-foreground truncate text-sm">{person.email}</p>
      </button>
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
      {editing && (
        <EditMemberDialog person={person} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

function EditMemberDialog({
  person,
  onClose,
}: {
  person: Profile
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async (values: PersonValues) => {
      const { error } = await supabase.rpc('update_team_member', {
        p_id: person.id,
        p_display_name: values.name,
        p_full_name: values.fullName,
        p_role: values.role,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      onClose()
    },
    onError: (error) => toast.error(say(error)),
  })

  return (
    <EditPersonDialog
      title={`Edit ${person.display_name}`}
      description={person.email ?? ''}
      initial={{
        name: person.display_name,
        fullName: person.full_name ?? '',
        role: person.role,
      }}
      showRole
      saving={save.isPending}
      onSave={(values) => save.mutate(values)}
      onClose={onClose}
    />
  )
}

function InviteRow({
  invite,
  busy,
  onCancel,
}: {
  invite: Invite
  busy: boolean
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const save = useMutation({
    mutationFn: async (values: PersonValues) => {
      const { error } = await supabase.rpc('update_invite', {
        p_id: invite.id,
        p_display_name: values.name,
        p_full_name: values.fullName,
        p_role: values.role,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['volunteer-invites'] })
      setEditing(false)
    },
    onError: (error) => toast.error(say(error)),
  })

  return (
    <div className="border-border bg-card flex items-center gap-3 rounded-lg border p-3">
      <button
        type="button"
        className="text-foreground min-h-11 min-w-0 flex-1 text-left"
        aria-label={`Edit invite for ${invite.display_name}`}
        onClick={() => setEditing(true)}
      >
        <p className="truncate font-medium">{invite.display_name}</p>
        {invite.full_name && (
          <p className="text-muted-foreground truncate text-sm">
            {invite.full_name}
          </p>
        )}
        <p className="text-muted-foreground truncate text-sm">{invite.email}</p>
      </button>
      <Badge variant="secondary">{roleLabels[invite.role]}</Badge>
      <Button
        type="button"
        variant="ghost"
        className="text-foreground min-h-11"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </Button>
      {editing && (
        <EditPersonDialog
          title={`Edit invite for ${invite.display_name}`}
          description={invite.email}
          initial={{
            name: invite.display_name,
            fullName: invite.full_name ?? '',
            role: invite.role,
          }}
          showRole
          saving={save.isPending}
          onSave={(values) => save.mutate(values)}
          onClose={() => setEditing(false)}
        />
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
  gst_percent: z.coerce
    .number()
    .min(0, 'Cannot be negative.')
    .max(100, 'Too big.'),
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
      gst_percent: Number(settings.data.gst_rate) * 100,
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
          gst_rate: parsed.gst_percent / 100,
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

  const sendTest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        to: string
        error?: string
      }>('weekly-treasurer-email', { body: { test: true } })
      if (error) {
        // A failed call hides the function's own message inside the response.
        const detail = await (error as { context?: Response }).context
          ?.json()
          .catch(() => null)
        throw new Error(detail?.error ?? error.message)
      }
      return data!
    },
    onSuccess: (data) => toast.success(`Test email sent to ${data.to}.`),
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
        hint="What usually stays in the box after the close count."
        prefix="$"
        error={form.formState.errors.float?.message}
        {...form.register('float')}
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

      <div className="flex flex-col gap-1.5">
        <p className="text-muted-foreground text-sm">
          The weekly email goes out Monday at 7:00. Send the same email to
          yourself to see how it looks.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={sendTest.isPending}
          onClick={() => sendTest.mutate()}
          className="text-foreground min-h-12"
        >
          {sendTest.isPending ? 'Sending…' : 'Send a test email to me'}
        </Button>
      </div>
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
