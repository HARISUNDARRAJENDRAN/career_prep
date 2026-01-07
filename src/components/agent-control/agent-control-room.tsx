'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  XCircle,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  FileText,
  Briefcase,
  TrendingUp,
  Brain,
  MoreHorizontal,
  Eye,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ApprovalQueue } from './approval-queue';
import { DirectivesList } from './directives-list';
import { AgentActivityFeed } from './agent-activity-feed';
import { useAgentActivityStream, type SprintProgressData } from '@/hooks/use-agent-activity-stream';

interface AgentControlRoomProps {
  userId: string;
}

interface AgentStatus {
  id: string;
  name: string;
  type: 'strategist' | 'resume' | 'action' | 'architect' | 'sentinel';
  status: 'active' | 'idle' | 'paused' | 'error';
  last_activity?: string;
  tasks_completed_today: number;
  current_task?: string;
  health_score: number;
}

interface SprintStatus {
  enabled: boolean;
  next_sprint?: string;
  last_sprint?: string;
  last_sprint_results?: {
    applications_created: number;
    health_score: number;
  };
}

interface ControlRoomStats {
  pending_approvals: number;
  active_directives: number;
  applications_today: number;
  ghosted_applications: number;
  health_score: number;
}

export function AgentControlRoom({ userId }: AgentControlRoomProps) {
  const queryClient = useQueryClient();
  const [liveSprintProgress, setLiveSprintProgress] = useState<SprintProgressData | null>(null);

  // Connect to SSE stream for real-time updates
  const {
    isConnected: sseConnected,
    initialState,
    sprintProgress: sseSprintProgress,
  } = useAgentActivityStream({
    onInitialState: (state) => {
      // Update stats from initial state
      queryClient.setQueryData(['agent-control-stats', userId], (old: ControlRoomStats | undefined) => ({
        ...old,
        pending_approvals: state.pending_approvals,
        active_directives: state.active_directives,
        applications_today: state.applications_today,
        ghosted_applications: old?.ghosted_applications ?? 0,
        health_score: old?.health_score ?? 0,
      }));
    },
    onSprintProgress: (progress) => {
      setLiveSprintProgress(progress);
    },
    onSprintComplete: (results) => {
      setLiveSprintProgress(null);
      // Invalidate queries to fetch fresh data
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sprint-status'] });
    },
    onDirectiveIssued: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
      queryClient.invalidateQueries({ queryKey: ['directives'] });
    },
    onApplicationSubmitted: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
    },
    onApprovalNeeded: (count) => {
      queryClient.setQueryData(['agent-control-stats', userId], (old: ControlRoomStats | undefined) => ({
        ...old,
        pending_approvals: count,
        applications_today: old?.applications_today ?? 0,
        active_directives: old?.active_directives ?? 0,
        ghosted_applications: old?.ghosted_applications ?? 0,
        health_score: old?.health_score ?? 0,
      }));
    },
    onAgentStatusChanged: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-statuses'] });
    },
  });

  // Sync live sprint progress
  useEffect(() => {
    if (sseSprintProgress) {
      setLiveSprintProgress(sseSprintProgress);
    }
  }, [sseSprintProgress]);

  // Fetch control room data
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['agent-control-stats', userId],
    queryFn: async () => {
      const res = await fetch('/api/agents/control-room/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json() as Promise<ControlRoomStats>;
    },
  });

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['agent-statuses', userId],
    queryFn: async () => {
      const res = await fetch('/api/agents/control-room/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      return res.json() as Promise<AgentStatus[]>;
    },
  });

  const { data: sprintStatus, isLoading: sprintLoading } = useQuery({
    queryKey: ['sprint-status', userId],
    queryFn: async () => {
      const res = await fetch('/api/agents/control-room/sprint');
      if (!res.ok) throw new Error('Failed to fetch sprint status');
      return res.json() as Promise<SprintStatus>;
    },
  });

  // Mutation to trigger sprint manually
  const triggerSprintMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/agents/control-room/sprint/trigger', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to trigger sprint');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-status'] });
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
    },
  });

  const getAgentIcon = (type: AgentStatus['type']) => {
    switch (type) {
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

  const getStatusBadge = (status: AgentStatus['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'idle':
        return <Badge variant="secondary">Idle</Badge>;
      case 'paused':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Paused</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Connection Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sseConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <Badge variant="outline" className="border-green-500 text-green-500">
                Live
              </Badge>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="border-muted text-muted-foreground">
                Reconnecting...
              </Badge>
            </>
          )}
        </div>
        {liveSprintProgress && (
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-blue-500">
              Sprint in progress: {liveSprintProgress.phase} ({Math.round(liveSprintProgress.progress)}%)
            </span>
          </div>
        )}
      </div>

      {/* Sprint Progress Bar */}
      {liveSprintProgress && (
        <Card className="border-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Weekly Sprint in Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Phase:</span>
              <span className="font-medium">{liveSprintProgress.phase}</span>
            </div>
            <Progress value={liveSprintProgress.progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{liveSprintProgress.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.pending_approvals ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Draft applications awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Directives</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.active_directives ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Strategic focus areas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications Today</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.applications_today ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Created by agents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.ghosted_applications ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Ghosted/at-risk applications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Health Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.health_score ?? 0}%</div>
                <Progress value={stats?.health_score ?? 0} className="mt-2" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Status + Sprint Control */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Agent Status Cards */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Agent Fleet Status</CardTitle>
            <CardDescription>Monitor your autonomous career agents</CardDescription>
          </CardHeader>
          <CardContent>
            {agentsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(agents ?? []).map((agent) => {
                  const Icon = getAgentIcon(agent.type);
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`rounded-full p-2 ${agent.status === 'active' ? 'bg-green-500/10' : 'bg-muted'}`}>
                          <Icon className={`h-5 w-5 ${agent.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{agent.name}</span>
                            {getStatusBadge(agent.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {agent.current_task || `${agent.tasks_completed_today} tasks completed today`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-sm">
                          <span className="text-muted-foreground">Health</span>
                          <div className="font-medium">{agent.health_score}%</div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Play className="mr-2 h-4 w-4" />
                              Force Run
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pause className="mr-2 h-4 w-4" />
                              Pause Agent
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Logs
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sprint Control */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Sprint</CardTitle>
            <CardDescription>Automated career workflow</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sprintLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={sprintStatus?.enabled ? 'default' : 'secondary'}>
                    {sprintStatus?.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                {sprintStatus?.next_sprint && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Next Sprint</span>
                    <span className="text-sm font-medium">
                      {new Date(sprintStatus.next_sprint).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}

                {sprintStatus?.last_sprint_results && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Last Sprint Results</p>
                    <div className="flex justify-between">
                      <span className="text-sm">Applications Created</span>
                      <span className="font-medium">{sprintStatus.last_sprint_results.applications_created}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Health Score</span>
                      <span className="font-medium">{sprintStatus.last_sprint_results.health_score}%</span>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => triggerSprintMutation.mutate()}
                  disabled={triggerSprintMutation.isPending}
                >
                  {triggerSprintMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Run Sprint Now
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="approvals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="approvals">
            Approval Queue
            {(stats?.pending_approvals ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2">
                {stats?.pending_approvals}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="directives">
            Directives
            {(stats?.active_directives ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2">
                {stats?.active_directives}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity Feed</TabsTrigger>
        </TabsList>

        <TabsContent value="approvals">
          <ApprovalQueue userId={userId} />
        </TabsContent>

        <TabsContent value="directives">
          <DirectivesList userId={userId} />
        </TabsContent>

        <TabsContent value="activity">
          <AgentActivityFeed userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
