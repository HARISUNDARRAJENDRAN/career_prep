'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Mic,
  FileText,
  Target,
  TrendingUp,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export type ActivityEvent = {
  id: string;
  type: 'interview' | 'skill_verified' | 'skill_gap' | 'skill_added' | 'roadmap';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: {
    score?: number;
    skillName?: string;
    count?: number;
  };
};

type Props = {
  events: ActivityEvent[];
};

function getEventIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'interview':
      return { icon: Mic, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' };
    case 'skill_verified':
      return { icon: CheckCircle2, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
    case 'skill_gap':
      return { icon: AlertTriangle, color: 'text-orange-500', bgColor: 'bg-orange-500/10' };
    case 'skill_added':
      return { icon: Target, color: 'text-violet-500', bgColor: 'bg-violet-500/10' };
    case 'roadmap':
      return { icon: TrendingUp, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' };
    default:
      return { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted' };
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActivityTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <CardDescription>Your journey timeline</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No activity yet. Start by adding skills or completing an interview!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Your journey timeline</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-[2px] bg-border" />

          <div className="space-y-4">
            {events.slice(0, 5).map((event, index) => {
              const { icon: Icon, color, bgColor } = getEventIcon(event.type);

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1, type: 'spring', stiffness: 100 }}
                  className="relative flex gap-3 pl-1"
                >
                  {/* Event icon */}
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bgColor}`}
                  >
                    <Icon className={`h-4 w-4 ${color}`} />
                  </motion.div>

                  {/* Event content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{event.title}</p>
                      {event.metadata?.score && (
                        <Badge variant="secondary" className="text-xs">
                          {event.metadata.score}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {event.description}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {formatTimeAgo(event.timestamp)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
