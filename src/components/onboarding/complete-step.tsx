'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { completeOnboarding } from '@/app/onboarding/actions';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Sparkles } from 'lucide-react';

export function CompleteStep() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding();
      if (result.success) {
        router.push('/dashboard');
      } else {
        setError(result.error || 'Something went wrong');
      }
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-primary/10 p-4">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
        <CardDescription className="text-base">
          Your profile is complete. You&apos;re ready to start your career preparation journey.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted rounded-lg p-4 space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            What&apos;s Next?
          </h4>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Your personalized career roadmap will be generated</li>
            <li>• Practice interviews with our AI interviewer</li>
            <li>• Get skill assessments and verification</li>
            <li>• Discover job opportunities matched to your profile</li>
          </ul>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <div className="flex justify-center">
          <Button size="lg" onClick={handleComplete} disabled={isPending}>
            {isPending ? 'Setting up...' : 'Go to Dashboard'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
