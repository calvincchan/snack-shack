// PROTOTYPE: floating variant switcher. Throwaway; never ships (dev only).
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
    const copy = new URLSearchParams(params)
    copy.set('variant', next.key)
    setParams(copy, { replace: true })
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]') !== null)
        return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1 text-sm text-white shadow-lg">
      <button
        type="button"
        onClick={() => go(-1)}
        className="flex size-9 items-center justify-center text-white"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-1 font-medium whitespace-nowrap text-white">
        {variants[index].key} ({variants[index].name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="flex size-9 items-center justify-center text-white"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
