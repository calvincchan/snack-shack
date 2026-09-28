import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogPurchase } from '@/app/buy/log-purchase'

export function BuyPage() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="sr-only">Buy</h1>

      <Tabs defaultValue="log">
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

        <TabsContent value="what" className="mt-4">
          <p className="text-muted-foreground text-sm">Not built yet.</p>
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <LogPurchase />
        </TabsContent>
        <TabsContent value="claims" className="mt-4">
          <p className="text-muted-foreground text-sm">Not built yet.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
