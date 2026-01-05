'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AgentProcessing } from '@/components/ui/agent-processing';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProcessingClientProps {
  interviewId: string;
  interviewType: 'reality_check' | 'weekly_sprint';
}

// Poll interval in milliseconds
const POLL_INTERVAL = 3000;
const MAX_POLL_ATTEMPTS = 60; // ~3 minutes max wait

export function ProcessingClient({ interviewId, interviewType }: ProcessingClientProps) {
  const router = useRouter();
  const [pollCount, setPollCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/interviews/${interviewId}/status`);

      if (!response.ok) {
        throw new Error('Failed to check interview status');
      }

      const data = await response.json();

      // Update step based on status
      if (data.has_analysis) {
        // Analysis complete, redirect to summary
        setCurrentStep(5); // All steps complete
        router.push(`/interviews/${interviewId}/summary`);
        return true;
      }

      // Estimate current step based on time elapsed
      // Each step takes roughly 30 seconds on average
      setCurrentStep((prev) => {
        if (prev < 4) return prev + 1;
        return 4; // Stay at last step while waiting
      });

      return false;
    } catch (err) {
      console.error('[ProcessingClient] Error checking status:', err);
      return false;
    }
  }, [interviewId, router]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const poll = async () => {
      if (pollCount >= MAX_POLL_ATTEMPTS) {
        setError('Analysis is taking longer than expected. You can wait or check back later.');
        return;
      }

      const complete = await checkStatus();
      if (!complete) {
        setPollCount((prev) => prev + 1);
        pollInterval = setTimeout(poll, POLL_INTERVAL);
      }
    };

    // Start polling after a short delay
    const initialDelay = setTimeout(poll, 1000);

    return () => {
      clearTimeout(initialDelay);
      clearTimeout(pollInterval);
    };
  }, [checkStatus, pollCount]);

  const title = interviewType === 'reality_check'
    ? 'Analyzing Your Reality Check'
    : 'Processing Your Sprint Review';

  const subtitle = interviewType === 'reality_check'
    ? 'Our AI agents are evaluating your skills and creating your personalized roadmap'
    : 'Checking your progress and updating skill verifications';

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-0">
        {error && (
          <Alert variant="destructive" className="m-6 mb-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/interviews/${interviewId}/summary`)}
              >
                Check Summary
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <AgentProcessing
          title={title}
          subtitle={subtitle}
          variant="interview"
          currentStep={currentStep}
        />

        {/* Progress indicator */}
        <div className="px-8 pb-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>
              AI agents are working... ({Math.round((pollCount * POLL_INTERVAL) / 1000)}s elapsed)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
