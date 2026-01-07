'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Brain,
  FileText,
  Briefcase,
  TrendingUp,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentActivityFeedProps {
  userId: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  agent: string;
  title: string;
  description?: string;
  status: 'success' | 'warning' | 'error' | 'info';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function AgentActivityFeed({ userId }: AgentActivityFeedProps) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['agent-activity', userId],
    queryFn: async () => {
      const res = await fetch('/api/agents/activity');
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json() as Promise<ActivityEvent[]>;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getAgentIcon = (agent: string) => {
    switch (agent.toLowerCase()) {
      case 'strategist':
        return Brain;
      case 'resume':
        return FileText;
      case 'action':
        return Briefcase;
      case 'architect':
        return TrendingUp;
      case 'sentinel':
        return Eye;
      default:
        return Bot;
    }
  };

  const getStatusIcon = (status: ActivityEvent['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'info':
        return <Clock className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status: ActivityEvent['status']) => {
    switch (status) {
      case 'success':
        return 'border-l-green-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'error':
        return 'border-l-red-500';
      case 'info':
        return 'border-l-blue-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Real-time agent activity log</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
          <CardDescription>Real-time agent activity log</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Recent Activity</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Agent activities will appear here as they happen.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group activities by date
  const groupedActivities = activities.reduce((groups, activity) => {
    const date = new Date(activity.timestamp).toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, ActivityEvent[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Feed</CardTitle>
        <CardDescription>Real-time agent activity log</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([date, events]) => (
              <div key={date}>
                <div className="sticky top-0 bg-background py-2">
                  <Badge variant="outline" className="font-normal">
                    {date === new Date().toLocaleDateString() ? 'Today' : date}
                  </Badge>
                </div>
                <div className="space-y-3 mt-2">
                  {events.map((activity) => {
                    const AgentIcon = getAgentIcon(activity.agent);
                    return (
                      <div
                        key={activity.id}
                        className={`flex items-start gap-3 rounded-lg border-l-4 p-3 transition-colors hover:bg-muted/50 ${getStatusColor(activity.status)}`}
                      >
                        <div className="rounded-full p-2 bg-muted">
                          <AgentIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{activity.title}</span>
                            {getStatusIcon(activity.status)}
                          </div>
                          {activity.description && (
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                              {activity.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {activity.agent}
                            </Badge>
                            <span>•</span>
                            <span>{formatTimestamp(activity.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
