'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AgentProcessing } from '@/components/ui/agent-processing';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Poll interval in milliseconds
const POLL_INTERVAL = 4000;
const MAX_POLL_ATTEMPTS = 45; // ~3 minutes max wait

export function GeneratingClient() {
  const router = useRouter();
  const [pollCount, setPollCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // Start roadmap generation
  const startGeneration = useCallback(async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setHasStarted(true);

    try {
      const response = await fetch('/api/roadmaps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start roadmap generation');
      }

      const data = await response.json();

      if (data.success && data.roadmap_id) {
        // Roadmap created successfully, redirect
        setCurrentStep(4); // All steps complete
        router.push('/roadmap');
      }
    } catch (err) {
      console.error('[GeneratingClient] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate roadmap');
      setIsGenerating(false);
    }
  }, [isGenerating, router]);

  // Check if roadmap exists (for polling after generation started)
  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/roadmaps');

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      if (data.roadmap) {
        // Roadmap exists, redirect
        router.push('/roadmap');
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [router]);

  // Start generation on mount
  useEffect(() => {
    if (!hasStarted) {
      startGeneration();
    }
  }, [hasStarted, startGeneration]);

  // Poll for completion if generation started but not redirected yet
  useEffect(() => {
    if (!hasStarted || !isGenerating) return;

    let pollInterval: NodeJS.Timeout;

    const poll = async () => {
      if (pollCount >= MAX_POLL_ATTEMPTS) {
        setError('Generation is taking longer than expected. Please check back later.');
        setIsGenerating(false);
        return;
      }

      // Advance step animation
      setCurrentStep((prev) => {
        if (prev < 3) return prev + 1;
        return 3;
      });

      const complete = await checkStatus();
      if (!complete) {
        setPollCount((prev) => prev + 1);
        pollInterval = setTimeout(poll, POLL_INTERVAL);
      }
    };

    // Start polling after generation API call
    const initialDelay = setTimeout(poll, 5000);

    return () => {
      clearTimeout(initialDelay);
      clearTimeout(pollInterval);
    };
  }, [hasStarted, isGenerating, checkStatus, pollCount]);

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
                onClick={() => {
                  setError(null);
                  setPollCount(0);
                  setHasStarted(false);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <AgentProcessing
          title="Creating Your Roadmap"
          subtitle="The Architect Agent is designing your personalized learning path"
          variant="roadmap"
          currentStep={currentStep}
        />

        {/* Progress indicator */}
        <div className="px-8 pb-8 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>
              {isGenerating
                ? `Architect Agent working... (${Math.round((pollCount * POLL_INTERVAL) / 1000)}s elapsed)`
                : error
                  ? 'Generation paused'
                  : 'Initializing...'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
