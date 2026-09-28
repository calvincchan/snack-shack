import { useState } from 'react'

/**
 * A stepper value that follows the server (the other phone's changes arrive
 * live) but never overwrites what this volunteer just entered. An edit is held
 * locally until the server shows the same number, then the value follows the
 * server again.
 * Pass null to drop a local edit that failed to save.
 */
export function useLiveValue(
  server: number,
): [number, (next: number | null) => void] {
  const [local, setLocal] = useState<number | null>(null)
  if (local !== null && local === server) setLocal(null)
  return [local ?? server, setLocal]
}
