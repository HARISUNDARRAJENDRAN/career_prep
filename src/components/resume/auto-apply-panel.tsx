'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Rocket,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Pause,
  Settings,
  Zap,
  FileText,
  Building2,
  MapPin,
  ExternalLink,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { ResumeProfile } from '@/lib/services/career-automation-client';

interface AutoApplyPanelProps {
  profile: ResumeProfile;
  onProfileUpdate?: (profile: ResumeProfile) => void;
}

interface DraftApplication {
  id: string;
  company: string;
  role: string;
  location?: string;
  match_score?: number;
  created_at: string;
  job_url?: string;
  agent_reasoning?: string;
  cover_letter_preview?: string;
}

interface SprintStatus {
  isRunning: boolean;
  currentPhase?: string;
  progress?: number;
  lastRun?: string;
  nextRun?: string;
  applicationsThisWeek?: number;
  targetApplications?: number;
}

interface AgentStatus {
  name: string;
  status: 'idle' | 'running' | 'error';
  lastActivity?: string;
  icon: React.ReactNode;
}

export function AutoApplyPanel({ profile, onProfileUpdate }: AutoApplyPanelProps) {
  const queryClient = useQueryClient();
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<DraftApplication | null>(null);
  const [editedCoverLetter, setEditedCoverLetter] = useState('');

  // Fetch sprint status
  const { data: sprintStatus, isLoading: loadingSprint } = useQuery<SprintStatus>({
    queryKey: ['sprint-status'],
    queryFn: async () => {
      const response = await fetch('/api/agents/control-room/sprint');
      if (!response.ok) throw new Error('Failed to fetch sprint status');
      return response.json();
    },
    refetchInterval: 10000, // Poll every 10s
  });

  // Fetch pending drafts
  const { data: pendingDrafts, isLoading: loadingDrafts } = useQuery<DraftApplication[]>({
    queryKey: ['pending-drafts'],
    queryFn: async () => {
      const response = await fetch('/api/applications/drafts?limit=5');
      if (!response.ok) throw new Error('Failed to fetch drafts');
      const data = await response.json();
      return data.drafts || [];
    },
    refetchInterval: 30000,
  });

  // Trigger sprint mutation
  const triggerSprint = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/agents/control-room/sprint/trigger', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to trigger sprint');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-status'] });
    },
  });

  // Approve draft mutation
  const approveDraft = useMutation({
    mutationFn: async ({ id, coverLetter }: { id: string; coverLetter?: string }) => {
      const response = await fetch(`/api/applications/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverLetter }),
      });
      if (!response.ok) throw new Error('Failed to approve');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-drafts'] });
      setSelectedDraft(null);
    },
  });

  // Reject draft mutation
  const rejectDraft = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/applications/${id}/reject`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to reject');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-drafts'] });
    },
  });

  const handleApproveDraft = useCallback(() => {
    if (selectedDraft) {
      approveDraft.mutate({
        id: selectedDraft.id,
        coverLetter: editedCoverLetter || selectedDraft.cover_letter_preview,
      });
    }
  }, [selectedDraft, editedCoverLetter, approveDraft]);

  const agents: AgentStatus[] = [
    {
      name: 'Strategist',
      status: sprintStatus?.currentPhase === 'strategy' ? 'running' : 'idle',
      lastActivity: 'Analyzed market trends',
      icon: <Target className="h-4 w-4" />,
    },
    {
      name: 'Resume Agent',
      status: sprintStatus?.currentPhase === 'resume' ? 'running' : 'idle',
      lastActivity: 'Tailored for 3 jobs',
      icon: <FileText className="h-4 w-4" />,
    },
    {
      name: 'Action Agent',
      status: sprintStatus?.currentPhase === 'action' ? 'running' : 'idle',
      lastActivity: 'Prepared applications',
      icon: <Rocket className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-4">
          {/* Sprint Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-base">Weekly Career Sprint</CardTitle>
                </div>
                <Badge variant={sprintStatus?.isRunning ? 'default' : 'secondary'}>
                  {sprintStatus?.isRunning ? 'Running' : 'Idle'}
                </Badge>
              </div>
              <CardDescription>
                AI agents automatically find and apply to matching jobs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSprint ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <>
                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Weekly Progress</span>
                      <span className="font-medium">
                        {sprintStatus?.applicationsThisWeek || 0} / {sprintStatus?.targetApplications || 10} applications
                      </span>
                    </div>
                    <Progress
                      value={
                        ((sprintStatus?.applicationsThisWeek || 0) /
                          (sprintStatus?.targetApplications || 10)) *
                        100
                      }
                    />
                  </div>

                  {/* Sprint Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Last Run</span>
                      <p className="font-medium">
                        {sprintStatus?.lastRun
                          ? new Date(sprintStatus.lastRun).toLocaleDateString()
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Next Run</span>
                      <p className="font-medium">
                        {sprintStatus?.nextRun
                          ? new Date(sprintStatus.nextRun).toLocaleDateString()
                          : 'Monday 6 AM'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => triggerSprint.mutate()}
                      disabled={triggerSprint.isPending || sprintStatus?.isRunning}
                      className="flex-1"
                    >
                      {triggerSprint.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting...
                        </>
                      ) : sprintStatus?.isRunning ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          In Progress...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Run Sprint Now
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Agent Fleet Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-base">Agent Fleet</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-full p-2 ${
                          agent.status === 'running'
                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                            : agent.status === 'error'
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                        }`}
                      >
                        {agent.icon}
                      </div>
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.lastActivity}</p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        agent.status === 'running'
                          ? 'default'
                          : agent.status === 'error'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {agent.status === 'running' && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {agent.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />
                  <CardTitle className="text-base">Pending Approvals</CardTitle>
                </div>
                {pendingDrafts && pendingDrafts.length > 0 && (
                  <Badge variant="secondary">{pendingDrafts.length}</Badge>
                )}
              </div>
              <CardDescription>Review and approve AI-prepared applications</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDrafts ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : !pendingDrafts || pendingDrafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-green-500" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">
                    No pending applications to review
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <p className="font-medium truncate">{draft.company}</p>
                          {draft.match_score && (
                            <Badge variant="outline" className="shrink-0">
                              {draft.match_score}% match
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{draft.role}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedDraft(draft);
                            setEditedCoverLetter(draft.cover_letter_preview || '');
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-600 hover:text-green-700 hover:bg-green-100"
                          onClick={() => approveDraft.mutate({ id: draft.id })}
                          disabled={approveDraft.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-100"
                          onClick={() => rejectDraft.mutate(draft.id)}
                          disabled={rejectDraft.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-gray-500" />
                <CardTitle className="text-base">Auto-Apply Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-apply">Enable Auto-Apply</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically apply to high-match jobs
                  </p>
                </div>
                <Switch
                  id="auto-apply"
                  checked={autoApplyEnabled}
                  onCheckedChange={setAutoApplyEnabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="require-approval">Require Approval</Label>
                  <p className="text-xs text-muted-foreground">
                    Review applications before submitting
                  </p>
                </div>
                <Switch
                  id="require-approval"
                  checked={requireApproval}
                  onCheckedChange={setRequireApproval}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Draft Review Dialog */}
      <Dialog open={!!selectedDraft} onOpenChange={() => setSelectedDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Application</DialogTitle>
            <DialogDescription>
              {selectedDraft?.company} - {selectedDraft?.role}
            </DialogDescription>
          </DialogHeader>
          
          {selectedDraft && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {selectedDraft.match_score && (
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {selectedDraft.match_score}% Match
                  </Badge>
                )}
                {selectedDraft.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {selectedDraft.location}
                  </div>
                )}
                {selectedDraft.job_url && (
                  <a
                    href={selectedDraft.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Job
                  </a>
                )}
              </div>

              {selectedDraft.agent_reasoning && (
                <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Why this job?
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    {selectedDraft.agent_reasoning}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cover-letter">Cover Letter</Label>
                <Textarea
                  id="cover-letter"
                  value={editedCoverLetter}
                  onChange={(e) => setEditedCoverLetter(e.target.value)}
                  rows={10}
                  className="resize-none font-mono text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedDraft) rejectDraft.mutate(selectedDraft.id);
              }}
              disabled={rejectDraft.isPending}
            >
              Reject
            </Button>
            <Button onClick={handleApproveDraft} disabled={approveDraft.isPending}>
              {approveDraft.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Approve & Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
