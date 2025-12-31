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
