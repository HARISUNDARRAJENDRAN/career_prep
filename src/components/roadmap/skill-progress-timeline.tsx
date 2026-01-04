'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { motion, type Variants } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';

export type VerificationEvent = {
  id: string;
  skillName: string;
  verifiedAt: Date;
  confidenceScore: number;
  verificationType: string;
  summary: string;
};

type Props = {
  verifications: VerificationEvent[];
};

// Chart configuration
const chartConfig = {
  confidence: {
    label: 'Confidence Score',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

const badgeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    },
  },
};

const chartVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 60,
      damping: 20,
      delay: 0.4,
    },
  },
};

export function SkillProgressTimeline({ verifications }: Props) {
  if (verifications.length === 0) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <Card>
          <CardHeader className="items-center pb-4">
            <motion.div variants={itemVariants} className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Skill Verification Timeline</CardTitle>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardDescription>
                Your skill verification history will appear here after completing interviews.
              </CardDescription>
            </motion.div>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  // Group verifications by date and calculate average confidence
  const timelineData = verifications
    .sort((a, b) => new Date(a.verifiedAt).getTime() - new Date(b.verifiedAt).getTime())
    .reduce((acc, v) => {
      const dateKey = new Date(v.verifiedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const existing = acc.find((d) => d.date === dateKey);
      if (existing) {
        existing.verifications.push(v);
        existing.confidence =
          existing.verifications.reduce((sum, ver) => sum + ver.confidenceScore, 0) /
          existing.verifications.length;
        existing.skillCount = existing.verifications.length;
      } else {
        acc.push({
          date: dateKey,
          fullDate: new Date(v.verifiedAt),
          confidence: v.confidenceScore,
          skillCount: 1,
          verifications: [v],
        });
      }
      return acc;
    }, [] as Array<{
      date: string;
      fullDate: Date;
      confidence: number;
      skillCount: number;
      verifications: VerificationEvent[];
    }>);

  // Calculate trend
  const calculateTrend = () => {
    if (timelineData.length < 2) return 'neutral';
    const firstHalf = timelineData.slice(0, Math.floor(timelineData.length / 2));
    const secondHalf = timelineData.slice(Math.floor(timelineData.length / 2));
    const firstAvg =
      firstHalf.reduce((sum, d) => sum + d.confidence, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, d) => sum + d.confidence, 0) / secondHalf.length;
    if (secondAvg > firstAvg + 5) return 'up';
    if (secondAvg < firstAvg - 5) return 'down';
    return 'neutral';
  };

  const trend = calculateTrend();
  const totalVerifications = verifications.length;
  const avgConfidence =
    verifications.reduce((sum, v) => sum + v.confidenceScore, 0) / totalVerifications;

  const trendConfig = {
    up: {
      icon: TrendingUp,
      label: 'Trending up',
      color: 'text-emerald-500',
    },
    down: {
      icon: TrendingDown,
      label: 'Trending down',
      color: 'text-red-500',
    },
    neutral: {
      icon: Minus,
      label: 'Stable',
      color: 'text-muted-foreground',
    },
  };

  const TrendIcon = trendConfig[trend].icon;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <Card>
        <CardHeader className="items-center pb-4">
          <motion.div variants={itemVariants}>
            <CardTitle>Skill Verification Timeline</CardTitle>
          </motion.div>
          <motion.div variants={itemVariants}>
            <CardDescription>
              Track your skill verification confidence scores over time
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="pb-0">
          <motion.div variants={chartVariants}>
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-video max-h-[250px] w-full"
            >
              <AreaChart
                data={timelineData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="fillConfidence" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-confidence)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-confidence)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 11 }}
                  width={40}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Area
                  type="monotone"
                  dataKey="confidence"
                  stroke="var(--color-confidence)"
                  strokeWidth={2}
                  fill="url(#fillConfidence)"
                />
              </AreaChart>
            </ChartContainer>
          </motion.div>
        </CardContent>
        <CardFooter className="flex-col gap-3 pt-4">
          {/* Stats badges */}
          <motion.div
            variants={containerVariants}
            className="flex flex-wrap justify-center gap-2"
          >
            <motion.div variants={badgeVariants}>
              <Badge variant="secondary" className="gap-1.5">
                <TrendIcon className={`h-3.5 w-3.5 ${trendConfig[trend].color}`} />
                {trendConfig[trend].label}
              </Badge>
            </motion.div>
            <motion.div variants={badgeVariants}>
              <Badge variant="outline">
                {totalVerifications} Verifications
              </Badge>
            </motion.div>
            <motion.div variants={badgeVariants}>
              <Badge variant="outline">
                Avg: {avgConfidence.toFixed(0)}%
              </Badge>
            </motion.div>
          </motion.div>
          {/* Trend indicator */}
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <TrendIcon className={`h-4 w-4 ${trendConfig[trend].color}`} />
            <span>
              {trend === 'up' && 'Your confidence scores are improving over time'}
              {trend === 'down' && 'Your confidence scores are declining'}
              {trend === 'neutral' && 'Your confidence scores are stable'}
            </span>
          </motion.div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
