'use client';

import * as React from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export type InterviewTrendData = {
  id: string;
  date: string;
  overallScore: number;
  communicationScore: number;
  selfAwarenessScore: number;
  careerAlignmentScore: number;
  type: 'reality_check' | 'weekly_sprint';
};

type Props = {
  interviews: InterviewTrendData[];
};

const chartConfig = {
  overall: {
    label: 'Overall',
    color: 'var(--chart-1)',
  },
  communication: {
    label: 'Communication',
    color: 'var(--chart-2)',
  },
  selfAwareness: {
    label: 'Self-Awareness',
    color: 'var(--chart-3)',
  },
  careerAlignment: {
    label: 'Career Alignment',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig;

type ChartKey = 'overall' | 'communication' | 'selfAwareness' | 'careerAlignment';

export function InterviewTrendsChart({ interviews }: Props) {
  const [activeChart, setActiveChart] = React.useState<ChartKey>('overall');

  // Transform data for the chart
  const chartData = React.useMemo(() => {
    return interviews.map((interview) => ({
      date: interview.date,
      overall: interview.overallScore,
      communication: interview.communicationScore,
      selfAwareness: interview.selfAwarenessScore,
      careerAlignment: interview.careerAlignmentScore,
      type: interview.type,
    }));
  }, [interviews]);

  // Calculate averages for each metric
  const averages = React.useMemo(() => {
    if (interviews.length === 0) {
      return { overall: 0, communication: 0, selfAwareness: 0, careerAlignment: 0 };
    }
    return {
      overall: Math.round(
        interviews.reduce((acc, curr) => acc + curr.overallScore, 0) / interviews.length
      ),
      communication: Math.round(
        interviews.reduce((acc, curr) => acc + curr.communicationScore, 0) / interviews.length
      ),
      selfAwareness: Math.round(
        interviews.reduce((acc, curr) => acc + curr.selfAwarenessScore, 0) / interviews.length
      ),
      careerAlignment: Math.round(
        interviews.reduce((acc, curr) => acc + curr.careerAlignmentScore, 0) / interviews.length
      ),
    };
  }, [interviews]);

  // Calculate trend (comparing first half to second half)
  const trend = React.useMemo(() => {
    if (interviews.length < 2) return 'neutral';
    const midpoint = Math.floor(interviews.length / 2);
    const firstHalf = interviews.slice(0, midpoint);
    const secondHalf = interviews.slice(midpoint);

    const firstAvg = firstHalf.reduce((acc, curr) => acc + curr.overallScore, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((acc, curr) => acc + curr.overallScore, 0) / secondHalf.length;

    if (secondAvg > firstAvg + 5) return 'up';
    if (secondAvg < firstAvg - 5) return 'down';
    return 'neutral';
  }, [interviews]);

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground';

  if (interviews.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Interview Performance</CardTitle>
          <CardDescription>
            Complete interviews to see your performance trends
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-muted-foreground">
          No interview data yet
        </CardContent>
      </Card>
    );
  }

  const chartKeys: ChartKey[] = ['overall', 'communication', 'selfAwareness', 'careerAlignment'];

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
          <CardTitle className="flex items-center gap-2">
            Interview Performance
            <TrendIcon className={`h-4 w-4 ${trendColor}`} />
          </CardTitle>
          <CardDescription>
            Track your interview scores over time
          </CardDescription>
        </div>
        <div className="flex">
          {chartKeys.map((key) => (
            <button
              key={key}
              data-active={activeChart === key}
              className="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l sm:border-t-0 sm:border-l sm:px-6 sm:py-4"
              onClick={() => setActiveChart(key)}
            >
              <span className="text-muted-foreground text-xs">
                {chartConfig[key].label}
              </span>
              <span className="text-lg leading-none font-bold sm:text-2xl">
                {averages[key]}%
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
              }}
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
              width={40}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[180px]"
                  nameKey={activeChart}
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                  }}
                />
              }
            />
            <Line
              dataKey={activeChart}
              type="monotone"
              stroke={`var(--color-${activeChart})`}
              strokeWidth={2}
              dot={{ fill: `var(--color-${activeChart})`, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
