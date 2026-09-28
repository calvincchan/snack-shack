import { useState } from 'react'
import { Link } from 'react-router'
import { CircleUserRound } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

/** Who is signed in on this phone, plus the way out and the admin screens. */
export function AccountMenu() {
  const { profile, isCoordinator, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  if (!profile) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-foreground shrink-0"
          aria-label={`Signed in as ${profile.display_name}`}
        >
          <CircleUserRound className="size-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-4">
        <SheetHeader>
          <SheetTitle>{profile.display_name}</SheetTitle>
          <SheetDescription>{profile.email}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4">
          {isCoordinator && (
            <Button
              asChild
              variant="outline"
              className="text-foreground min-h-12 justify-start"
            >
              <Link to="/admin" onClick={() => setOpen(false)}>
                Team and settings
              </Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="text-foreground min-h-12 justify-start"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
