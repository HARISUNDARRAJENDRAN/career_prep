'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Pause, Target, FileText, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface BlockingDirective {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string;
  action_required?: string;
  expires_at?: string;
}

const directiveIcons: Record<string, React.ElementType> = {
  pause_applications: Pause,
  focus_shift: TrendingUp,
  skill_priority: Target,
  resume_rewrite: FileText,
};

const priorityStyles: Record<string, string> = {
  critical: 'border-red-500 bg-red-50 dark:bg-red-900/20',
  high: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20',
  medium: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
  low: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
};

export function DirectiveBanner() {
  const { data: directives, isLoading } = useQuery({
    queryKey: ['blocking-directives'],
    queryFn: async () => {
      const res = await fetch('/api/agents/directives?blocking=true');
      if (!res.ok) return [];
      return res.json() as Promise<BlockingDirective[]>;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading || !directives || directives.length === 0) {
    return null;
  }

  const blockingDirective = directives[0];
  const Icon = directiveIcons[blockingDirective.type] || AlertTriangle;
  const priorityStyle = priorityStyles[blockingDirective.priority] || priorityStyles.medium;

  return (
    <Alert className={`mb-6 border-l-4 ${priorityStyle}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          <div className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm">
            <Icon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <AlertTitle className="text-lg flex items-center gap-2 mb-1">
            Strategic Directive Active
            <Badge
              variant="outline"
              className="text-xs font-normal"
            >
              {blockingDirective.priority}
            </Badge>
          </AlertTitle>

          <AlertDescription className="space-y-3">
            <p className="font-medium text-foreground">
              {blockingDirective.title}
            </p>

            <p className="text-sm text-muted-foreground">
              {blockingDirective.description}
            </p>

            {blockingDirective.action_required && (
              <div className="p-2 bg-white/50 dark:bg-black/20 rounded-md">
                <p className="text-sm">
                  <span className="font-medium">Required Action:</span>{' '}
                  {blockingDirective.action_required}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Link href="/dashboard/agent-requests?tab=directives">
                <Button variant="default" size="sm" className="gap-2">
                  View Directive
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>

              {directives.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  +{directives.length - 1} more directive{directives.length > 2 ? 's' : ''}
                </span>
              )}
            </div>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
