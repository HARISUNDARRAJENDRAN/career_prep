'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Target,
  TrendingUp,
  Award,
  Briefcase,
  CheckCircle2,
  Clock,
  Zap,
  Users,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  target: Target,
  'trending-up': TrendingUp,
  award: Award,
  briefcase: Briefcase,
  'check-circle': CheckCircle2,
  clock: Clock,
  zap: Zap,
  users: Users,
};

type Props = {
  title: string;
  value: number;
  subtitle: string;
  icon: string;
  index?: number;
  suffix?: string;
  accentColor?: string;
};

export function AnimatedStatsCard({
  title,
  value,
  subtitle,
  icon,
  index = 0,
  suffix = '',
  accentColor,
}: Props) {
  const Icon = iconMap[icon] || Target;
  const [displayValue, setDisplayValue] = useState(0);

  // Animate the counter
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const stepDuration = duration / steps;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplayValue(current);

      if (step >= steps) {
        clearInterval(timer);
        setDisplayValue(value);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 100,
        damping: 15,
        delay: index * 0.1,
      }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="h-full"
    >
      <Card className="h-full overflow-hidden relative group">
        {/* Accent gradient on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: accentColor
              ? `linear-gradient(135deg, ${accentColor}10 0%, transparent 50%)`
              : undefined,
          }}
        />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <motion.div
            whileHover={{ rotate: 10, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
          </motion.div>
        </CardHeader>
        <CardContent className="relative">
          <motion.div
            className="text-2xl font-bold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.1 + 0.3 }}
          >
            {displayValue}{suffix}
          </motion.div>
          <motion.p
            className="text-xs text-muted-foreground truncate"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 + 0.4 }}
          >
            {subtitle}
          </motion.p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
