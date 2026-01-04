import { MarketInsightsDisplay } from '@/components/market/market-insights-display';

export default function MarketInsightsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Market Insights
        </h1>
        <p className="text-muted-foreground">
          Real-time job market trends powered by the Sentinel Agent.
        </p>
      </div>

      <MarketInsightsDisplay />
    </div>
  );
}
