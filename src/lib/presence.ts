/** Who is doing what on the sale day right now (ADR-0010). */
export type Activity = 'stock' | 'cash' | 'sign'

export type Peer = { userId: string; name: string; activity: Activity | null }

const DOING: Record<Activity, string> = {
  stock: 'counting stock',
  cash: 'counting cash',
  sign: 'signing off',
}

/** "Yuki is counting cash", "Yuki and Sam are counting stock"; empty if nobody is busy. */
export function presenceLabels(peers: Peer[]): string[] {
  const byActivity = new Map<Activity, string[]>()
  for (const peer of peers) {
    if (!peer.activity) continue
    byActivity.set(peer.activity, [
      ...(byActivity.get(peer.activity) ?? []),
      peer.name,
    ])
  }
  return [...byActivity].map(([activity, names]) => {
    const who = names.length > 1 ? names.join(' and ') : names[0]
    return `${who} ${names.length > 1 ? 'are' : 'is'} ${DOING[activity]}`
  })
}

/** The most someone can take out: Out plus Left may not pass the starting count. */
export function outMax(startCount: number, left: number): number {
  return Math.max(0, startCount - left)
}
