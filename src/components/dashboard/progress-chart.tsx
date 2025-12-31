'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// Mock data for progress visualization
// This will be replaced with real data from interviews and roadmap progress
const mockData = [
  { week: 'Week 1', progress: 0 },
  { week: 'Week 2', progress: 0 },
  { week: 'Week 3', progress: 0 },
  { week: 'Week 4', progress: 0 },
];

const chartConfig = {
  progress: {
    label: 'Progress',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

export function ProgressChart() {
  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <AreaChart
        data={mockData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="progressGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-progress)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-progress)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="progress"
          stroke="var(--color-progress)"
          fillOpacity={1}
          fill="url(#progressGradient)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
