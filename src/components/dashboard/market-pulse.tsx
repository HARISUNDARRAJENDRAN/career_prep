'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Flame, Sparkles } from 'lucide-react';

export type TrendingSkill = {
  name: string;
  demandScore: number;
  trend: 'up' | 'down' | 'stable';
  category?: string;
  userHasSkill: boolean;
};

type Props = {
  skills: TrendingSkill[];
};

function getTrendIcon(trend: TrendingSkill['trend']) {
  switch (trend) {
    case 'up':
      return { icon: TrendingUp, color: 'text-emerald-500' };
    case 'down':
      return { icon: TrendingDown, color: 'text-red-500' };
    default:
      return { icon: Minus, color: 'text-muted-foreground' };
  }
}

export function MarketPulse({ skills }: Props) {
  if (skills.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Market Pulse
          </CardTitle>
          <CardDescription>Trending skills in your field</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Market insights will appear here once you set your target roles.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort by demand score
  const sortedSkills = [...skills].sort((a, b) => b.demandScore - a.demandScore);
  const topSkills = sortedSkills.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Market Pulse
        </CardTitle>
        <CardDescription>Top skills in demand for your goals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {topSkills.map((skill, index) => {
          const { icon: TrendIcon, color } = getTrendIcon(skill.trend);
          const isHot = skill.demandScore >= 8;

          return (
            <motion.div
              key={skill.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{skill.name}</span>
                  {isHot && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Flame className="h-3.5 w-3.5 text-orange-500" />
                    </motion.div>
                  )}
                  {skill.userHasSkill && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      You have this
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TrendIcon className={`h-3.5 w-3.5 ${color}`} />
                  <span className="text-xs text-muted-foreground">
                    {skill.demandScore}/10
                  </span>
                </div>
              </div>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.5 }}
                style={{ transformOrigin: 'left' }}
              >
                <Progress
                  value={skill.demandScore * 10}
                  className="h-1.5"
                />
              </motion.div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
