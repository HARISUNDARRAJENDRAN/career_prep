import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ThemeSelector } from '@/components/ui/theme-selector';

export default async function SettingsPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex-between border-b border-border bg-card px-6 py-4">
        <div className="flex-center gap-4">
          <Link
            href="/dashboard"
            className="flex-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Theme Settings */}
          <section className="rounded-lg border border-border bg-card p-6">
            <ThemeSelector />
          </section>

          {/* Clerk User Profile */}
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-foreground">
                Account Settings
              </h3>
              <p className="text-sm text-muted-foreground">
                Manage your account details and security.
              </p>
            </div>
            <UserProfile
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none border-0 bg-transparent',
                  navbar: 'hidden',
                  pageScrollBox: 'p-0',
                  formButtonPrimary:
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                  formFieldLabel: 'text-foreground',
                  formFieldInput: 'bg-background border-input text-foreground',
                  headerTitle: 'text-foreground',
                  headerSubtitle: 'text-muted-foreground',
                },
              }}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
