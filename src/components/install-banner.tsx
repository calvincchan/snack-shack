import { Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInstall } from '@/lib/install'

/** Add to home screen: a button where the browser allows it, steps on iPhone. */
export function InstallBanner() {
  const { mode, install, dismiss } = useInstall()
  if (!mode) return null

  return (
    <section
      aria-label="Install the app"
      className="bg-accent text-accent-foreground flex items-center gap-3 px-4 py-2 text-sm"
    >
      <p className="min-w-0 flex-1">
        {mode === 'prompt' ? (
          'Put Snack Shack on your home screen.'
        ) : (
          <>
            To install, tap{' '}
            <Share aria-label="Share" className="inline size-4" /> then “Add to
            Home Screen”.
          </>
        )}
      </p>
      {mode === 'prompt' && (
        <Button
          type="button"
          size="sm"
          className="text-primary-foreground min-h-11"
          onClick={install}
        >
          Install
        </Button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-foreground flex size-11 items-center justify-center"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  )
}
