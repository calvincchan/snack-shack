import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogPurchase, type PrefilledLine } from '@/app/buy/log-purchase'
import { DealCheck } from '@/app/buy/deal-check'
import { WhatToBuy } from '@/app/buy/what-to-buy'
import { Claims } from '@/app/buy/claims'

export function BuyPage() {
  // PROTOTYPE: ?variant= opens straight on Claims.
  const [params] = useSearchParams()
  const [segment, setSegment] = useState(
    params.has('variant') ? 'claims' : 'what',
  )
  // "Bought it" carries the Deal check numbers into Log purchase. The key
  // remounts the form so it starts from them.
  const [prefill, setPrefill] = useState<PrefilledLine | null>(null)
  const [prefillKey, setPrefillKey] = useState(0)

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="sr-only">Buy</h1>

      <Tabs value={segment} onValueChange={setSegment}>
        <TabsList className="w-full">
          <TabsTrigger value="what" className="min-h-11 flex-1">
            What to buy
          </TabsTrigger>
          <TabsTrigger value="log" className="min-h-11 flex-1">
            Log purchase
          </TabsTrigger>
          <TabsTrigger value="claims" className="min-h-11 flex-1">
            Claims
          </TabsTrigger>
        </TabsList>

        <TabsContent value="what" className="mt-4 flex flex-col gap-4">
          <WhatToBuy />
          <DealCheck
            onBoughtIt={(bought) => {
              setPrefill(bought)
              setPrefillKey((key) => key + 1)
              setSegment('log')
              toast.success(
                'Numbers carried over. Add a name and the receipt photo.',
              )
            }}
          />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <LogPurchase key={prefillKey} prefill={prefill} />
        </TabsContent>
        <TabsContent value="claims" className="mt-4">
          <Claims />
        </TabsContent>
      </Tabs>
    </div>
  )
}
