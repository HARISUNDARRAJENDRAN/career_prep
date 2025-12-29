'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadResume, skipResume } from '@/app/onboarding/actions';
import { FileUp, Loader2 } from 'lucide-react';

interface ResumeUploadStepProps {
  onNext: (parsedData?: any) => void;
  onBack: () => void;
}

export function ResumeUploadStep({ onNext, onBack }: ResumeUploadStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.match(/\.(pdf|docx)$/i)) {
        setError('Only PDF and DOCX files are supported');
        return;
      }
      // Validate file size (5MB max)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  }

  function handleUpload() {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('resume', file);

      setUploadProgress('Uploading resume...');

      setTimeout(() => setUploadProgress('Extracting text...'), 1000);
      setTimeout(() => setUploadProgress('Analyzing skills with AI...'), 3000);

      const result = await uploadResume(formData);

      if (result.success) {
        setUploadProgress('');
        if (result.parsedData) {
          // Navigate to review step with parsed data
          onNext(result.parsedData);
        } else {
          onNext();
        }
      } else {
        setUploadProgress('');
        setError(result.error || 'Upload failed');
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await skipResume();
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Failed to skip');
      }
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Upload Your Resume (Optional)</CardTitle>
        <CardDescription>
          Upload your resume to auto-populate your skills and experience. We support PDF and DOCX files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="resume">Resume File</Label>
          <Input
            id="resume"
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            disabled={isPending}
          />
          {file && (
            <p className="text-sm text-muted-foreground">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {uploadProgress && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploadProgress}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={isPending}>
              Skip
            </Button>
            <Button onClick={handleUpload} disabled={!file || isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Upload & Continue
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
