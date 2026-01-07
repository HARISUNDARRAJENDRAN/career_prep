'use client';

import * as React from 'react';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResumePdfPreviewProps {
  pdfUrl: string | null;
  isGenerating: boolean;
}

export function ResumePdfPreview({ pdfUrl, isGenerating }: ResumePdfPreviewProps) {
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed bg-muted/30">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <p className="font-medium">Generating your resume...</p>
          <p className="text-sm text-muted-foreground">
            This may take a few seconds
          </p>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed bg-muted/30">
        <div className="rounded-full bg-muted p-4">
          <FileText className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="max-w-[280px] text-center">
          <p className="font-medium">No preview yet</p>
          <p className="text-sm text-muted-foreground">
            Fill in your details and click &quot;Preview PDF&quot; to see your
            resume
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(pdfUrl, '_blank')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open in New Tab
        </Button>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-lg border bg-white">
        <iframe
          src={`${pdfUrl}#toolbar=0&navpanes=0`}
          className="h-full w-full"
          title="Resume Preview"
        />
      </div>
    </div>
  );
}
