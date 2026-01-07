'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Brain,
  FileText,
  Briefcase,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';

interface DirectivesListProps {
  userId: string;
}

interface Directive {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'failed' | 'superseded';
  title: string;
  description: string;
  reasoning?: string;
  target_agent?: string;
  action_required?: string;
  issued_at: string;
  executed_at?: string;
  expires_at?: string;
  result?: Record<string, unknown>;
  impact_metrics?: Record<string, unknown>;
}

export function DirectivesList({ userId }: DirectivesListProps) {
  const queryClient = useQueryClient();

  const { data: directives, isLoading } = useQuery({
    queryKey: ['directives', userId],
    queryFn: async () => {
      const res = await fetch('/api/agents/directives');
      if (!res.ok) throw new Error('Failed to fetch directives');
      return res.json() as Promise<Directive[]>;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (directiveId: string) => {
      const res = await fetch(`/api/agents/directives/${directiveId}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to cancel directive');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directives'] });
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (directiveId: string) => {
      const res = await fetch(`/api/agents/directives/${directiveId}/complete`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to complete directive');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directives'] });
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
      queryClient.invalidateQueries({ queryKey: ['blocking-directives'] });
    },
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'skill_priority':
        return TrendingUp;
      case 'resume_rewrite':
        return FileText;
      case 'application_strategy':
      case 'ghosting_response':
        return Briefcase;
      case 'focus_shift':
        return Target;
      default:
        return Brain;
    }
  };

  const getPriorityBadge = (priority: Directive['priority']) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium</Badge>;
      case 'low':
        return <Badge variant="outline">Low</Badge>;
    }
  };

  const getStatusBadge = (status: Directive['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'active':
        return <Badge className="bg-blue-500"><RotateCcw className="mr-1 h-3 w-3 animate-spin" />Active</Badge>;
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><XCircle className="mr-1 h-3 w-3" />Cancelled</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Failed</Badge>;
      case 'superseded':
        return <Badge variant="outline"><ChevronRight className="mr-1 h-3 w-3" />Superseded</Badge>;
    }
  };

  const getTypeLabel = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strategic Directives</CardTitle>
          <CardDescription>Active focus areas guiding your career agents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!directives || directives.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strategic Directives</CardTitle>
          <CardDescription>Active focus areas guiding your career agents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Active Directives</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The Strategist Agent will issue directives based on your career progress.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeDirectives = directives.filter((d) => d.status === 'pending' || d.status === 'active');
  const completedDirectives = directives.filter((d) => d.status === 'completed');
  const otherDirectives = directives.filter((d) => !['pending', 'active', 'completed'].includes(d.status));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategic Directives</CardTitle>
        <CardDescription>
          Focus areas identified by the Strategist Agent to improve your job search
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible defaultValue="active" className="w-full">
          {/* Active Directives */}
          <AccordionItem value="active">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <span>Active Directives</span>
                <Badge variant="secondary">{activeDirectives.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {activeDirectives.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No active directives at the moment.
                    </p>
                  ) : (
                    activeDirectives.map((directive) => {
                      const Icon = getTypeIcon(directive.type);
                      return (
                        <div
                          key={directive.id}
                          className="rounded-lg border p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="rounded-full p-2 bg-primary/10">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium">{directive.title}</h4>
                                  {getPriorityBadge(directive.priority)}
                                  {getStatusBadge(directive.status)}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {directive.description}
                                </p>
                              </div>
                            </div>
                            {['pending', 'active'].includes(directive.status) && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => completeMutation.mutate(directive.id)}
                                  disabled={completeMutation.isPending}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Complete
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => cancelMutation.mutate(directive.id)}
                                  disabled={cancelMutation.isPending}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {directive.reasoning && (
                            <div className="text-sm bg-muted/50 rounded p-2">
                              <span className="font-medium">Reasoning: </span>
                              {directive.reasoning}
                            </div>
                          )}

                          {directive.action_required && (
                            <div className="text-sm">
                              <span className="font-medium">Action Required: </span>
                              {directive.action_required}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Target: {directive.target_agent || 'All Agents'} • 
                              Type: {getTypeLabel(directive.type)}
                            </span>
                            <span>
                              Issued: {new Date(directive.issued_at).toLocaleDateString()}
                              {directive.expires_at && (
                                <> • Expires: {new Date(directive.expires_at).toLocaleDateString()}</>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>

          {/* Completed Directives */}
          <AccordionItem value="completed">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <span>Completed Directives</span>
                <Badge variant="outline">{completedDirectives.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2">
                  {completedDirectives.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No completed directives yet.
                    </p>
                  ) : (
                    completedDirectives.map((directive) => {
                      const Icon = getTypeIcon(directive.type);
                      return (
                        <div
                          key={directive.id}
                          className="flex items-center justify-between rounded-lg border p-3 bg-green-500/5"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-green-500" />
                            <div>
                              <span className="font-medium text-sm">{directive.title}</span>
                              <p className="text-xs text-muted-foreground">
                                Completed {directive.executed_at && new Date(directive.executed_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>

          {/* Other (Cancelled/Failed/Superseded) */}
          {otherDirectives.length > 0 && (
            <AccordionItem value="other">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <span>Archived</span>
                  <Badge variant="outline">{otherDirectives.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ScrollArea className="h-[150px] pr-4">
                  <div className="space-y-2">
                    {otherDirectives.map((directive) => {
                      const Icon = getTypeIcon(directive.type);
                      return (
                        <div
                          key={directive.id}
                          className="flex items-center justify-between rounded-lg border p-3 opacity-60"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{directive.title}</span>
                          </div>
                          {getStatusBadge(directive.status)}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}
