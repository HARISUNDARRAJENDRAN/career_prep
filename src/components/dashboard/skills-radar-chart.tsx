'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface SkillWithDetails {
  id: string;
  skill?: {
    name: string;
    category: string | null;
  } | null;
  proficiency_level: string;
  verification_metadata?: {
    is_verified?: boolean;
  } | null;
}

interface SkillsRadarChartProps {
  skills: SkillWithDetails[];
}

const proficiencyToNumber: Record<string, number> = {
  learning: 25,
  practicing: 50,
  proficient: 75,
  expert: 100,
};

const chartConfig = {
  proficiency: {
    label: 'Proficiency',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function SkillsRadarChart({ skills }: SkillsRadarChartProps) {
  // Group skills by category and calculate average proficiency
  const categoryMap = new Map<string, { total: number; count: number }>();

  skills.forEach((skill) => {
    const category = skill.skill?.category || 'Other';
    const proficiency = proficiencyToNumber[skill.proficiency_level] || 50;

    if (categoryMap.has(category)) {
      const existing = categoryMap.get(category)!;
      existing.total += proficiency;
      existing.count += 1;
    } else {
      categoryMap.set(category, { total: proficiency, count: 1 });
    }
  });

  const data = Array.from(categoryMap.entries())
    .map(([category, { total, count }]) => ({
      category: category.length > 12 ? category.slice(0, 12) + '...' : category,
      fullCategory: category,
      proficiency: Math.round(total / count),
      count,
    }))
    .slice(0, 8); // Limit to 8 categories for readability

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        <p>No skills data available. Upload your resume to get started.</p>
      </div>
    );
  }

  // Add some padding categories if we have less than 4
  while (data.length < 4) {
    data.push({
      category: '-',
      fullCategory: 'Empty',
      proficiency: 0,
      count: 0,
    });
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[300px]">
      <RadarChart data={data}>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent />}
        />
        <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
        <PolarGrid />
        <Radar
          name="Proficiency"
          dataKey="proficiency"
          stroke="var(--color-proficiency)"
          fill="var(--color-proficiency)"
          fillOpacity={0.5}
        />
      </RadarChart>
    </ChartContainer>
  );
}
