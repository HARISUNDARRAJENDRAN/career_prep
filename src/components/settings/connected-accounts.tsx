'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Linkedin,
  Briefcase,
  Globe,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Link2,
  Unlink,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Credential {
  id: string;
  platform: string;
  accountIdentifier: string | null;
  status: 'active' | 'expired' | 'invalid' | 'revoked' | 'pending';
  statusMessage: string | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PlatformConfig {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  connectUrl?: string;
  color: string;
}

// ============================================================================
// Platform Configuration
// ============================================================================

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    description: 'Apply to jobs with Easy Apply',
    connectUrl: 'https://www.linkedin.com/login',
    color: 'text-blue-600',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    icon: Briefcase,
    description: 'One-click applications on Indeed',
    connectUrl: 'https://secure.indeed.com/account/login',
    color: 'text-indigo-600',
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    icon: Globe,
    description: 'Apply through Glassdoor listings',
    connectUrl: 'https://www.glassdoor.com/member/home/index.htm',
    color: 'text-green-600',
  },
];

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: Credential['status'] }) {
  const config = {
    active: {
      icon: CheckCircle2,
      label: 'Connected',
      variant: 'default' as const,
      className: 'bg-green-100 text-green-800 hover:bg-green-100',
    },
    expired: {
      icon: Clock,
      label: 'Expired',
      variant: 'secondary' as const,
      className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    },
    invalid: {
      icon: XCircle,
      label: 'Invalid',
      variant: 'destructive' as const,
      className: '',
    },
    revoked: {
      icon: Unlink,
      label: 'Disconnected',
      variant: 'outline' as const,
      className: '',
    },
    pending: {
      icon: AlertCircle,
      label: 'Pending',
      variant: 'secondary' as const,
      className: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    },
  };

  const { icon: Icon, label, variant, className } = config[status];

  return (
    <Badge variant={variant} className={className}>
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

// ============================================================================
// Platform Card Component
// ============================================================================

interface PlatformCardProps {
  platform: PlatformConfig;
  credential: Credential | null;
  onConnect: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
  isLoading: boolean;
}

function PlatformCard({
  platform,
  credential,
  onConnect,
  onDisconnect,
  isLoading,
}: PlatformCardProps) {
  const Icon = platform.icon;
  const isConnected = credential?.status === 'active';
  const needsReconnect =
    credential?.status === 'expired' || credential?.status === 'invalid';

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg bg-muted ${platform.color}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{platform.name}</h3>
            {credential && <StatusBadge status={credential.status} />}
          </div>
          <p className="text-sm text-muted-foreground">
            {credential?.accountIdentifier || platform.description}
          </p>
          {credential?.lastUsedAt && (
            <p className="text-xs text-muted-foreground">
              Last used:{' '}
              {new Date(credential.lastUsedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isConnected ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoading}>
                <Unlink className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {platform.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove your saved session for {platform.name}. The
                  Action Agent will no longer be able to automatically apply to
                  jobs on this platform until you reconnect.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDisconnect(platform.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : needsReconnect ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConnect(platform.id)}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reconnect
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => onConnect(platform.id)}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ConnectedAccounts() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch credentials on mount
  const fetchCredentials = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/credentials');

      if (!response.ok) {
        throw new Error('Failed to fetch credentials');
      }

      const data = await response.json();
      setCredentials(data.credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Connect handler - opens browser extension flow
  const handleConnect = useCallback((platformId: string) => {
    const platform = PLATFORMS.find((p) => p.id === platformId);
    if (!platform?.connectUrl) return;

    // Open a popup window for the user to log in
    // In a real implementation, you'd use a browser extension or OAuth flow
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      platform.connectUrl,
      `Connect ${platform.name}`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // Show instructions
    setError(
      `Please log in to ${platform.name} in the popup window, then use the browser extension to capture your session.`
    );
  }, []);

  // Disconnect handler
  const handleDisconnect = useCallback(
    async (platformId: string) => {
      try {
        setActionLoading(platformId);
        setError(null);

        const response = await fetch('/api/credentials', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: platformId, permanent: false }),
        });

        if (!response.ok) {
          throw new Error('Failed to disconnect account');
        }

        // Refresh credentials list
        await fetchCredentials();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to disconnect account'
        );
      } finally {
        setActionLoading(null);
      }
    },
    [fetchCredentials]
  );

  // Get credential for a platform
  const getCredential = (platformId: string) =>
    credentials.find((c) => c.platform === platformId) || null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Connect your job platform accounts for automated applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>
          Connect your job platform accounts to enable automated applications.
          Your credentials are encrypted and stored securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              credential={getCredential(platform.id)}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              isLoading={actionLoading === platform.id}
            />
          ))}
        </div>

        <div className="mt-6 rounded-lg bg-muted/50 p-4">
          <h4 className="mb-2 font-medium">How it works</h4>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>Click &quot;Connect&quot; to open the platform login page</li>
            <li>Log in with your credentials in the popup window</li>
            <li>
              Open DevTools (F12) → Application → Cookies → Copy your session cookie
            </li>
            <li>
              Return here and paste your session cookie when prompted
            </li>
            <li>
              The Action Agent can now apply to jobs on your behalf
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            For LinkedIn, copy the &quot;li_at&quot; cookie. For Indeed, copy the session cookie.
            Your credentials are encrypted with AES-256-GCM.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
