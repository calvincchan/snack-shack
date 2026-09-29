/**
 * "What the numbers say" (HANDOFF §5.8, ADR-0008). Each rule is a database
 * view that has rows only when the rule applies; this file reads the views and
 * words the facts. Nothing is computed or generated here.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCents } from '@/lib/money'
import { formatSaleDateShort } from '@/lib/time'

export type RuleFacts = {
  fading: {
    name: string
    firstDate: string
    firstPieces: number
    lastDate: string
    lastPieces: number
  }[]
  soldOut: { name: string; soldOutDays: number; daysOut: number }[]
  slowest: { name: string; piecesPerDayOut: number; daysOut: number } | null
  treatShare: { treatPct: number } | null
  losses: { pieces: number; costCents: number } | null
}

export function useRuleFacts() {
  return useQuery({
    queryKey: ['insights', 'rules'],
    queryFn: async (): Promise<RuleFacts> => {
      const [fading, soldOut, slowest, treatShare, losses] = await Promise.all([
        supabase.from('insights_fading_items').select('*').order('name'),
        supabase
          .from('insights_sold_out_items')
          .select('*')
          .order('sold_out_days', { ascending: false })
          .order('name'),
        supabase.from('insights_slowest_item').select('*').maybeSingle(),
        supabase.from('insights_treat_share').select('*').maybeSingle(),
        supabase.from('insights_check_stock_losses').select('*').maybeSingle(),
      ])
      for (const result of [fading, soldOut, slowest, treatShare, losses]) {
        if (result.error) throw result.error
      }

      return {
        fading: fading.data!.map((row) => ({
          name: row.name!,
          firstDate: row.first_date!,
          firstPieces: row.first_pieces!,
          lastDate: row.last_date!,
          lastPieces: row.last_pieces!,
        })),
        soldOut: soldOut.data!.map((row) => ({
          name: row.name!,
          soldOutDays: row.sold_out_days!,
          daysOut: row.days_out!,
        })),
        slowest: slowest.data && {
          name: slowest.data.name!,
          piecesPerDayOut: slowest.data.pieces_per_day_out!,
          daysOut: slowest.data.days_out!,
        },
        treatShare: treatShare.data && { treatPct: treatShare.data.treat_pct! },
        losses: losses.data && {
          pieces: losses.data.pieces!,
          costCents: losses.data.cost_cents!,
        },
      }
    },
  })
}

export type Sentence = {
  key: string
  /** The fact, shown bold. */
  lead: string
  /** What to do about it, when there is something to do. */
  rest: string
}

/** One sentence per rule that applies, in the order the handoff lists them. */
export function numbersSay(facts: RuleFacts): Sentence[] {
  const lines: Sentence[] = []

  for (const item of facts.fading) {
    lines.push({
      key: `fading:${item.name}`,
      lead: `${item.name} sales are fading.`,
      rest: `${item.firstPieces} sold on ${formatSaleDateShort(item.firstDate)}, ${item.lastPieces} on ${formatSaleDateShort(item.lastDate)}. Leave it out of the lineup on cold days.`,
    })
  }

  for (const item of facts.soldOut) {
    const when =
      item.daysOut === 1
        ? 'on its only day out'
        : item.soldOutDays === item.daysOut
          ? `all ${item.daysOut} days it was out`
          : `${item.soldOutDays} of the ${item.daysOut} days it was out`
    lines.push({
      key: `sold-out:${item.name}`,
      lead: `${item.name} sold out ${when}.`,
      rest: 'Bring more of it, or buy more next trip.',
    })
  }

  if (facts.slowest) {
    lines.push({
      key: 'slowest',
      lead: `${facts.slowest.name} is the slowest mover, about ${facts.slowest.piecesPerDayOut} sold per sale day it is out.`,
      rest: 'Try a lower price on the Items tab, or leave it out of the lineup for a while.',
    })
  }

  if (facts.treatShare) {
    lines.push({
      key: 'treat-share',
      lead: `${facts.treatShare.treatPct}% of items sold are treats.`,
      rest: '',
    })
  }

  if (facts.losses) {
    const { pieces, costCents } = facts.losses
    lines.push({
      key: 'losses',
      lead: `${pieces} ${pieces === 1 ? 'item was' : 'items were'} missing or damaged before sales (${formatCents(costCents)} at cost).`,
      rest: "Found during Check stock, so they didn't throw off the cash.",
    })
  }

  return lines
}
