'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Link2,
  Unlink,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

interface GmailConnectionProps {
  className?: string;
}

interface GmailStatus {
  connected: boolean;
  message: string;
  last_synced?: string;
}

export function GmailConnection({ className }: GmailConnectionProps) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch Gmail connection status
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/emails/sync');

      if (!response.ok) {
        const data = await response.json();
        setStatus({
          connected: false,
          message: data.message || 'Gmail not connected',
        });
        return;
      }

      const data = await response.json();
      setStatus({
        connected: data.connected,
        message: data.message,
        last_synced: data.last_synced,
      });
    } catch (error) {
      setStatus({
        connected: false,
        message: 'Failed to check Gmail status',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manual sync handler
  const handleSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      toast.info('Syncing emails from Gmail...');

      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days_back: 7 }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.action_required === 'connect_gmail') {
          toast.error('Please connect your Gmail account first');
        } else if (data.action_required === 'reconnect_gmail') {
          toast.error('Gmail connection expired. Please reconnect');
          setStatus({ connected: false, message: 'Connection expired' });
        } else {
          toast.error(data.message || 'Failed to sync emails');
        }
        return;
      }

      toast.success(
        `Successfully processed ${data.processed} out of ${data.total} emails`
      );
      await fetchStatus();
    } catch (error) {
      toast.error('Failed to sync emails');
      console.error('[Gmail Sync] Error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchStatus]);

  // Connect to Gmail
  const handleConnect = useCallback(() => {
    // Redirect to OAuth flow
    window.location.href = '/api/auth/gmail';
  }, []);

  // Check for success/error messages in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    const message = params.get('message');

    if (success === 'gmail_connected') {
      toast.success('Gmail connected successfully!');
      // Clean URL
      window.history.replaceState({}, '', '/settings');
      fetchStatus();
    } else if (error) {
      const errorMessages: Record<string, string> = {
        gmail_auth_failed: 'Failed to initiate Gmail authentication',
        gmail_permission_denied: 'Gmail permission denied',
        gmail_missing_code: 'Gmail authorization failed',
        gmail_token_exchange_failed: message || 'Failed to connect Gmail',
      };
      toast.error(errorMessages[error] || 'Gmail connection failed');
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    }
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-red-600">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold">Gmail</h3>
            <p className="text-sm text-muted-foreground">
              Checking connection status...
            </p>
          </div>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-red-600">
          <Mail className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Gmail</h3>
            {status?.connected ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">
                <XCircle className="mr-1 h-3 w-3" />
                Not Connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{status?.message}</p>
          {status?.last_synced && (
            <p className="text-xs text-muted-foreground">
              Last synced: {new Date(status.last_synced).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status?.connected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Now
            </Button>
          </>
        ) : (
          <Button variant="default" size="sm" onClick={handleConnect}>
            <Link2 className="mr-2 h-4 w-4" />
            Connect Gmail
          </Button>
        )}
      </div>
    </div>
  );
}
