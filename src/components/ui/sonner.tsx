import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** Clears the bottom tab bar (min-h-12 + safe area) so a toast never covers the tabs. */
const ABOVE_NAVBAR = 'calc(env(safe-area-inset-bottom) + 4.25rem)'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      richColors
      position="bottom-center"
      offset={{ bottom: ABOVE_NAVBAR, left: '1rem', right: '1rem' }}
      mobileOffset={{ bottom: ABOVE_NAVBAR, left: '1rem', right: '1rem' }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // --popover does not exist; the palette tokens live in index.css.
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--ok-bg)',
          '--success-text': 'var(--ok)',
          '--success-border': 'var(--ok)',
          '--error-bg': 'var(--bad-bg)',
          '--error-text': 'var(--bad)',
          '--error-border': 'var(--bad)',
          '--warning-bg': 'var(--warn-bg)',
          '--warning-text': 'var(--warn)',
          '--warning-border': 'var(--warn)',
          '--info-bg': 'var(--surface)',
          '--info-text': 'var(--ink)',
          '--info-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
