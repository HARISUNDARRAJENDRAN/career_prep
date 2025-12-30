import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { OnboardingWizard } from '@/components/onboarding';
import { getOnboardingState } from './actions';
import { SignOutButton } from '@clerk/nextjs';

// Prevent caching to always check fresh auth state
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Get onboarding state from database
  const { step, completed, profile } = await getOnboardingState();

  // If onboarding is already completed, redirect to dashboard
  if (completed) {
    redirect('/dashboard');
  }

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <SignOutButton>
          <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign out
          </button>
        </SignOutButton>
        <ThemeToggle />
      </div>

      <div className="container mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-foreground">
            Welcome to Career Prep
          </h1>
          <p className="mt-2 text-muted-foreground">
            Let&apos;s set up your profile to personalize your experience.
          </p>
        </div>

        <OnboardingWizard initialStep={step} profile={profile} />
      </div>
    </div>
  );
}
