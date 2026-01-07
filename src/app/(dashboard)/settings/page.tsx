import { currentUser } from '@clerk/nextjs/server';
import { UserProfile } from '@clerk/nextjs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ThemeSelector } from '@/components/ui/theme-selector';
import { ConnectedAccounts } from '@/components/settings/connected-accounts';
import { GmailConnection } from '@/components/settings/gmail-connection';

export default async function SettingsPage() {
  const user = await currentUser();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how Career Prep looks on your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Email Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle>Email Monitoring</CardTitle>
          <CardDescription>
            Connect your Gmail to automatically track application responses, rejections, and interview invitations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GmailConnection />
          <div className="mt-4 rounded-lg bg-muted/50 p-4">
            <h4 className="mb-2 font-medium">How it works</h4>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Connects securely via Google OAuth 2.0</li>
              <li>Monitors your inbox hourly for job-related emails</li>
              <li>Automatically updates application statuses</li>
              <li>Provides AI-powered rejection insights and feedback</li>
              <li>Read-only access - we never send emails on your behalf</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Your credentials are encrypted with AES-256-GCM and stored securely.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Manage your job platform credentials for autonomous job applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAccounts />
        </CardContent>
      </Card>

      {/* Clerk User Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            Manage your account details and security.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserProfile
            routing="hash"
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
        </CardContent>
      </Card>
    </div>
  );
}
