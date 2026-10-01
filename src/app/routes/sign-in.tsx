import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email.')
    .email('That does not look like an email.'),
})

type Values = z.infer<typeof schema>

export function SignInPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit({ email }: Values) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      form.setError('email', { message: error.message })
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return <CodeStep email={sentTo} onBack={() => setSentTo(null)} />
  }

  return (
    <main className="bg-background text-foreground mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Snack Shack</h1>
        <p className="text-muted-foreground">
          Sign in with your email. We email you a code, so there is no password
          to remember.
        </p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
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
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="text-primary-foreground min-h-12"
        >
          {form.formState.isSubmitting ? 'Sending…' : 'Email me a code'}
        </Button>
      </form>
    </main>
  )
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
})

type CodeValues = z.infer<typeof codeSchema>

/** A link opens in Safari, not the home screen app, so the app takes the code. */
function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const form = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  })

  async function onSubmit({ code }: CodeValues) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })
    if (error) form.setError('code', { message: error.message })
  }

  return (
    <main className="bg-background text-foreground mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <MailCheck className="text-primary size-10" aria-hidden="true" />
      <h1 className="font-heading text-2xl font-semibold">Check your email</h1>
      <p className="text-muted-foreground">
        We sent a 6-digit code to{' '}
        <span className="text-foreground">{email}</span>. Enter it here. You
        stay signed in.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="min-h-12 tabular-nums"
          aria-invalid={Boolean(form.formState.errors.code)}
          {...form.register('code')}
        />
        {form.formState.errors.code && (
          <p role="alert" className="text-destructive text-sm">
            {form.formState.errors.code.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="text-primary-foreground min-h-12"
        >
          {form.formState.isSubmitting ? 'Checking…' : 'Sign in'}
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-12"
        onClick={onBack}
      >
        Use a different email
      </Button>
    </main>
  )
}
