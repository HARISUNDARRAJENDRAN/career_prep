import { UserButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui/button';
import { db } from '@/drizzle/db';
import { users } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Check if user has completed onboarding
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_id, user.id),
  });

  // If user hasn't completed onboarding, redirect to onboarding
  if (!dbUser?.onboarding_completed) {
    redirect('/onboarding');
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex-between border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">
          Career Prep
        </h1>
        <div className="flex-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            Welcome, {user.firstName || user.emailAddresses[0]?.emailAddress}
          </h2>
          <p className="mt-2 text-muted-foreground">
            Your career preparation journey starts here.
          </p>
        </div>
      </main>
    </div>
  );
}
