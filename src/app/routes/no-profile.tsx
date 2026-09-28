import { UserRoundSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

/** Signed in, but not on the team (or no longer on it). This is the whole app. */
export function NoProfilePage({ email }: { email: string | null }) {
  const { signOut } = useAuth()

  return (
    <main className="bg-background text-foreground mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <UserRoundSearch
        className="text-muted-foreground size-10"
        aria-hidden="true"
      />
      <h1 className="font-heading text-2xl font-semibold">
        Ask the coordinator to add you
      </h1>
      <p className="text-muted-foreground">
        You are signed in{email ? ' as ' : ''}
        {email && <span className="text-foreground">{email}</span>}, but you are
        not on the Snack Shack team yet. Ask the coordinator to add this email,
        then open the app again.
      </p>
      <Button
        type="button"
        variant="outline"
        className="text-foreground min-h-12"
        onClick={() => void signOut()}
      >
        Sign out
      </Button>
    </main>
  )
}
