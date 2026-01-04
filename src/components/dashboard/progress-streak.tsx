'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame, Calendar, Award, Zap } from 'lucide-react';

type Props = {
  currentStreak: number;
  longestStreak: number;
  totalInterviews: number;
  lastActivityDate?: Date;
  weeklyActivity: boolean[]; // Last 7 days, true = active
};

export function ProgressStreak({
  currentStreak,
  longestStreak,
  totalInterviews,
  lastActivityDate,
  weeklyActivity = [false, false, false, false, false, false, false],
}: Props) {
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const activeDays = weeklyActivity.filter(Boolean).length;
  const isActiveToday = weeklyActivity[weeklyActivity.length - 1];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className={`h-4 w-4 ${currentStreak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
          Your Progress
        </CardTitle>
        <CardDescription>Keep the momentum going</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Streak Counter */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center justify-center py-4"
        >
          <div className="text-center">
            <motion.div
              animate={currentStreak > 0 ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="relative"
            >
              <div className={`text-5xl font-bold ${currentStreak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                {currentStreak}
              </div>
              {currentStreak > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute -top-1 -right-3"
                >
                  <Flame className="h-5 w-5 text-orange-500" />
                </motion.div>
              )}
            </motion.div>
            <p className="text-sm text-muted-foreground mt-1">
              {currentStreak === 1 ? 'day streak' : 'days streak'}
            </p>
          </div>
        </motion.div>

        {/* Weekly Activity */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">This Week</p>
          <div className="flex justify-between gap-1">
            {weeklyActivity.map((active, idx) => (
              <motion.div
                key={idx}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                    active
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {active ? (
                    <Zap className="h-4 w-4" />
                  ) : (
                    <span className="text-xs">{dayLabels[idx]}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {activeDays} of 7 days active
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{longestStreak}</p>
              <p className="text-xs text-muted-foreground">Best Streak</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{totalInterviews}</p>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
            </div>
          </div>
        </div>

        {/* Motivation Message */}
        {!isActiveToday && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center"
          >
            <p className="text-sm">
              {currentStreak > 0
                ? "Don't break your streak! Practice today."
                : "Start a new streak by completing an interview!"}
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
