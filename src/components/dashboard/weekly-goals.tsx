'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Target, Trophy } from 'lucide-react';

export type WeeklyGoal = {
  id: string;
  title: string;
  completed: boolean;
};

type Props = {
  goals: WeeklyGoal[];
  completedInterviews: number;
  targetInterviews?: number;
};

const defaultGoals: WeeklyGoal[] = [
  { id: '1', title: 'Complete a practice interview', completed: false },
  { id: '2', title: 'Review skill gap recommendations', completed: false },
  { id: '3', title: 'Apply to 3 matching jobs', completed: false },
  { id: '4', title: 'Update your target roles', completed: false },
];

export function WeeklyGoals({ goals = defaultGoals, completedInterviews, targetInterviews = 2 }: Props) {
  const completedCount = goals.filter(g => g.completed).length;
  const progress = (completedCount / goals.length) * 100;
  const interviewProgress = Math.min((completedInterviews / targetInterviews) * 100, 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-500" />
          Weekly Goals
        </CardTitle>
        <CardDescription>Stay on track with your career prep</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Interview Goal */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border bg-muted/30 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Weekly Interviews</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {completedInterviews}/{targetInterviews}
            </span>
          </div>
          <Progress value={interviewProgress} className="h-2" />
        </motion.div>

        {/* Goal Checklist */}
        <div className="space-y-3">
          {goals.map((goal, index) => (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              <Checkbox
                id={goal.id}
                checked={goal.completed}
                disabled
                className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
              />
              <label
                htmlFor={goal.id}
                className={`text-sm flex-1 ${goal.completed ? 'line-through text-muted-foreground' : ''}`}
              >
                {goal.title}
              </label>
            </motion.div>
          ))}
        </div>

        {/* Overall Progress */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Weekly Progress</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}
