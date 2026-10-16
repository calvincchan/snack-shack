// PROTOTYPE: throwaway variant switcher (prototype/repack branch). Not for main.
import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router'

export function PrototypeSwitcher({
  variants,
}: {
  variants: { key: string; name: string }[]
}) {
  const [params, setParams] = useSearchParams()
  const current = params.get('variant') ?? variants[0].key
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  )

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length]
    setParams(
      (prev) => {
        prev.set('variant', next.key)
        return prev
      },
      { replace: true },
    )
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-2 py-1 text-sm font-medium text-white shadow-lg">
      <button
        type="button"
        aria-label="Previous variant"
        className="flex size-9 items-center justify-center text-white"
        onClick={() => go(-1)}
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="px-1 whitespace-nowrap text-white">
        {variants[index].key} ({variants[index].name})
      </span>
      <button
        type="button"
        aria-label="Next variant"
        className="flex size-9 items-center justify-center text-white"
        onClick={() => go(1)}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}
