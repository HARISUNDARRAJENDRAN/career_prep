'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  XCircle,
  ExternalLink,
  FileText,
  Building2,
  MapPin,
  Clock,
  Star,
  Edit,
  Trash2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ApprovalQueueProps {
  userId: string;
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
  resume_version?: string;
  cover_letter_preview?: string;
}

export function ApprovalQueue({ userId }: ApprovalQueueProps) {
  const queryClient = useQueryClient();
  const [selectedApp, setSelectedApp] = React.useState<DraftApplication | null>(null);
  const [editedCoverLetter, setEditedCoverLetter] = React.useState('');

  // Fetch draft applications
  const { data: drafts, isLoading } = useQuery({
    queryKey: ['draft-applications', userId],
    queryFn: async () => {
      const res = await fetch('/api/applications/drafts');
      if (!res.ok) throw new Error('Failed to fetch drafts');
      const data = await res.json();
      return (data.drafts ?? []) as DraftApplication[];
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`/api/applications/${applicationId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_letter: editedCoverLetter || undefined }),
      });
      if (!res.ok) throw new Error('Failed to approve application');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-applications'] });
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
      setSelectedApp(null);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`/api/applications/${applicationId}/reject`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reject application');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-applications'] });
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
    },
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (applicationIds: string[]) => {
      const res = await fetch('/api/applications/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_ids: applicationIds }),
      });
      if (!res.ok) throw new Error('Failed to bulk approve');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-applications'] });
      queryClient.invalidateQueries({ queryKey: ['agent-control-stats'] });
    },
  });

  const handleOpenReview = (app: DraftApplication) => {
    setSelectedApp(app);
    setEditedCoverLetter(app.cover_letter_preview || '');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Approval Queue</CardTitle>
          <CardDescription>Review and approve draft applications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Approval Queue</CardTitle>
          <CardDescription>Review and approve draft applications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No draft applications waiting for your review.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Approval Queue</CardTitle>
            <CardDescription>Review and approve draft applications created by agents</CardDescription>
          </div>
          {drafts.length > 1 && (
            <Button
              variant="outline"
              onClick={() => bulkApproveMutation.mutate(drafts.map((d) => d.id))}
              disabled={bulkApproveMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve All ({drafts.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="flex items-start justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">{draft.role}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 className="h-4 w-4" />
                          <span>{draft.company}</span>
                          {draft.location && (
                            <>
                              <span>•</span>
                              <MapPin className="h-4 w-4" />
                              <span>{draft.location}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {draft.match_score && (
                        <Badge
                          variant={draft.match_score >= 80 ? 'default' : 'secondary'}
                          className={draft.match_score >= 80 ? 'bg-green-500' : ''}
                        >
                          <Star className="mr-1 h-3 w-3" />
                          {draft.match_score}% match
                        </Badge>
                      )}
                    </div>

                    {draft.agent_reasoning && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        <span className="font-medium">AI Reasoning:</span> {draft.agent_reasoning}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Created {new Date(draft.created_at).toLocaleDateString()}</span>
                      {draft.resume_version && (
                        <>
                          <span>•</span>
                          <FileText className="h-3 w-3" />
                          <span>Resume: {draft.resume_version}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {draft.job_url && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={draft.job_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenReview(draft)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Review
                    </Button>

                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => approveMutation.mutate(draft.id)}
                      disabled={approveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600">
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reject Application?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the draft application for {draft.role} at {draft.company}. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => rejectMutation.mutate(draft.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Reject
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Application</DialogTitle>
            <DialogDescription>
              {selectedApp?.role} at {selectedApp?.company}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedApp?.agent_reasoning && (
              <div>
                <Label className="text-sm font-medium">AI Reasoning</Label>
                <p className="text-sm text-muted-foreground mt-1 p-3 bg-muted rounded-lg">
                  {selectedApp.agent_reasoning}
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="cover-letter">Cover Letter (Optional)</Label>
              <Textarea
                id="cover-letter"
                value={editedCoverLetter}
                onChange={(e) => setEditedCoverLetter(e.target.value)}
                placeholder="Edit or add a cover letter..."
                className="mt-1 min-h-[200px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedApp(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedApp && approveMutation.mutate(selectedApp.id)}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve & Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
