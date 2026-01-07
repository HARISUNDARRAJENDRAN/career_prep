'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, ExternalLink, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ApplicationScreenshotProps {
  applicationId: string;
  company: string;
  role: string;
  screenshotUrl?: string;
  status: 'success' | 'draft' | 'failed' | 'pending';
  fieldsFilled?: number;
  fieldsMissing?: string[];
  message?: string;
  submittedAt?: string;
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    color: 'bg-green-500',
    textColor: 'text-green-500',
    label: 'Submitted',
  },
  draft: {
    icon: AlertCircle,
    color: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    label: 'Draft',
  },
  failed: {
    icon: AlertCircle,
    color: 'bg-red-500',
    textColor: 'text-red-500',
    label: 'Failed',
  },
  pending: {
    icon: Clock,
    color: 'bg-blue-500',
    textColor: 'text-blue-500',
    label: 'Pending',
  },
};

export function ApplicationScreenshot({
  applicationId,
  company,
  role,
  screenshotUrl,
  status,
  fieldsFilled = 0,
  fieldsMissing = [],
  message,
  submittedAt,
}: ApplicationScreenshotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          View Proof
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Application: {role} at {company}
            <Badge className={config.color}>{config.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold">{fieldsFilled}</p>
              <p className="text-sm text-muted-foreground">Fields Filled</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{fieldsMissing.length}</p>
              <p className="text-sm text-muted-foreground">Fields Missing</p>
            </div>
            <div className="text-center">
              <StatusIcon
                className={`h-8 w-8 mx-auto ${config.textColor}`}
              />
              <p className="text-sm text-muted-foreground">{config.label}</p>
            </div>
          </div>

          {/* Missing fields warning */}
          {fieldsMissing.length > 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Missing fields: {fieldsMissing.join(', ')}
              </p>
            </div>
          )}

          {/* Message */}
          {message && (
            <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
              {message}
            </p>
          )}

          {/* Submission time */}
          {submittedAt && (
            <p className="text-xs text-muted-foreground">
              Submitted: {new Date(submittedAt).toLocaleString()}
            </p>
          )}

          {/* Screenshot */}
          {screenshotUrl && !imageError ? (
            <div className="relative border rounded-lg overflow-hidden">
              <Image
                src={screenshotUrl}
                alt={`Application screenshot for ${company}`}
                width={1920}
                height={1080}
                className="w-full h-auto"
                onError={() => setImageError(true)}
                unoptimized // For external URLs
              />
              <a
                href={screenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2"
              >
                <Button variant="secondary" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
              <p className="text-muted-foreground">
                {imageError ? 'Failed to load screenshot' : 'No screenshot available'}
              </p>
            </div>
          )}

          {/* Application ID for debugging */}
          <p className="text-xs text-muted-foreground text-center">
            Application ID: {applicationId}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
