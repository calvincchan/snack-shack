import { useState } from 'react'
import { Link } from 'react-router'
import { CircleUserRound } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAuth, type Profile } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { EditPersonDialog, type PersonValues } from '@/app/edit-person-dialog'

/** Who is signed in on this phone, plus their profile, the way out and the admin screens. */
export function AccountMenu() {
  const { profile, isCoordinator, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!profile) return null

  return (
    <>
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
            <Button
              type="button"
              variant="outline"
              className="text-foreground min-h-12 justify-start"
              onClick={() => {
                setOpen(false)
                setEditing(true)
              }}
            >
              Edit profile
            </Button>
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
      {editing && (
        <EditProfileDialog
          profile={profile}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

/** Your own display name and full name; the role stays with the coordinator. */
function EditProfileDialog({
  profile,
  onClose,
}: {
  profile: Profile
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: async (values: PersonValues) => {
      const { error } = await supabase.rpc('update_my_profile', {
        p_display_name: values.name,
        p_full_name: values.fullName,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Profile saved.')
      onClose()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <EditPersonDialog
      title="Edit profile"
      description="Your name shows on sign-offs and claims."
      initial={{
        name: profile.display_name,
        fullName: profile.full_name ?? '',
        role: profile.role,
      }}
      showRole={false}
      saving={save.isPending}
      onSave={(values) => save.mutate(values)}
      onClose={onClose}
    />
  )
}
