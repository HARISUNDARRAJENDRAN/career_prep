'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bot, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AutoApplyButtonProps {
  jobListingId: string;
  company: string;
  role: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onSuccess?: (applicationId: string) => void;
  onError?: (error: string) => void;
}

export function AutoApplyButton({
  jobListingId,
  company,
  role,
  disabled = false,
  variant = 'default',
  size = 'default',
  onSuccess,
  onError,
}: AutoApplyButtonProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<{
    title: string;
    reason: string;
    actionRequired?: string;
  } | null>(null);

  const handleAutoApply = async () => {
    setIsApplying(true);
    toast.info(`Starting auto-apply to ${company}...`, {
      description: 'Browser automation in progress',
    });

    try {
      const response = await fetch('/api/agents/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_listing_id: jobListingId }),
      });

      const result = await response.json();

      if (response.status === 403 && result.directive_id) {
        // Blocked by directive
        setBlockedInfo({
          title: result.directive_title,
          reason: result.reason,
          actionRequired: result.action_required,
        });
        setShowBlockedDialog(true);
        onError?.(`Blocked by directive: ${result.directive_title}`);
        return;
      }

      if (response.status === 409) {
        toast.warning(`Already applied to ${role} at ${company}`, {
          description: 'This job has an existing application',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Application failed');
      }

      if (result.status === 'success') {
        toast.success(`Applied to ${role} at ${company}!`, {
          description: `${result.fields_filled || 0} fields filled automatically`,
        });
        onSuccess?.(result.application_id);
      } else if (result.status === 'draft') {
        toast.warning(`Created draft for ${company}`, {
          description: result.message || 'Manual completion may be required',
        });
        onSuccess?.(result.application_id);
      } else {
        toast.error(`Application incomplete`, {
          description: result.message,
        });
        onError?.(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Auto-apply failed', {
        description: message,
      });
      onError?.(message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleAutoApply}
              disabled={disabled || isApplying}
              variant={variant}
              size={size}
              className="gap-2"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4" />
                  Auto Apply
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Automatically fill and submit application using AI</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Blocked by Directive Dialog */}
      <AlertDialog open={showBlockedDialog} onOpenChange={setShowBlockedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Application Blocked
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  A strategic directive is preventing this application:
                </p>
                {blockedInfo && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <p className="font-medium">{blockedInfo.title}</p>
                    <p className="text-sm">{blockedInfo.reason}</p>
                    {blockedInfo.actionRequired && (
                      <p className="text-sm text-blue-600 dark:text-blue-400">
                        Required: {blockedInfo.actionRequired}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.location.href = '/dashboard/agent-requests?tab=directives';
              }}
            >
              View Directive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
