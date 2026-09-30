import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'snack-shack:install-dismissed'

/** Chrome's install event; not in the DOM lib types. */
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallMode = 'prompt' | 'ios-hint' | null

/**
 * What to offer a volunteer. Chrome and Android hand over an install event;
 * iPhone has none, so it gets the Share-sheet steps instead. Nothing shows
 * once the app is installed or the volunteer has said no.
 */
export function installMode({
  standalone,
  ios,
  hasPrompt,
  dismissed,
}: {
  standalone: boolean
  ios: boolean
  hasPrompt: boolean
  dismissed: boolean
}): InstallMode {
  if (standalone || dismissed) return null
  if (hasPrompt) return 'prompt'
  return ios ? 'ios-hint' : null
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

export function useInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true',
  )
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const mode = installMode({
    standalone: installed || isStandalone(),
    ios: isIos(),
    hasPrompt: event !== null,
    dismissed,
  })

  return {
    mode,
    install: async () => {
      if (!event) return
      await event.prompt()
      await event.userChoice
      setEvent(null)
    },
    dismiss: () => {
      localStorage.setItem(DISMISSED_KEY, 'true')
      setDismissed(true)
    },
  }
}
