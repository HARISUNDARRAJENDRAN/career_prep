import { SignIn } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <SignIn
        appearance={{
          elements: {
            formButtonPrimary:
              'bg-primary text-primary-foreground hover:bg-primary/90',
            card: 'bg-card shadow-lg',
            headerTitle: 'text-foreground',
            headerSubtitle: 'text-muted-foreground',
            socialButtonsBlockButton:
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            formFieldLabel: 'text-foreground',
            formFieldInput:
              'bg-background border-input text-foreground',
            footerActionLink: 'text-primary hover:text-primary/80',
            identityPreviewText: 'text-foreground',
            identityPreviewEditButton: 'text-primary',
          },
        }}
      />
    </div>
  );
}
