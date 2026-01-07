'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { ResumeForm } from './resume-form';
import { ResumePdfPreview } from './resume-pdf-preview';
import { ResumeTailoringPanel } from './resume-tailoring-panel';
import { AutoApplyPanel } from './auto-apply-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileText, Wand2, Download, Settings2, Loader2, Rocket } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ResumeProfile } from '@/lib/services/career-automation-client';

interface ResumeBuilderProps {
  initialProfile: ResumeProfile;
}

const TEMPLATES = [
  { id: 'modern', name: 'Modern', description: 'Clean and professional' },
  { id: 'classic', name: 'Classic', description: 'Traditional format' },
  { id: 'minimalist', name: 'Minimalist', description: 'Simple and elegant' },
  { id: 'deedy', name: 'Deedy', description: 'Academic/Tech style' },
];

export function ResumeBuilder({ initialProfile }: ResumeBuilderProps) {
  const [profile, setProfile] = useState<ResumeProfile>(initialProfile);
  const [template, setTemplate] = useState('modern');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'tailor' | 'apply'>('edit');

  const handleProfileChange = useCallback((updatedProfile: ResumeProfile) => {
    setProfile(updatedProfile);
    // Clear PDF preview when profile changes
    setPdfUrl(null);
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, template }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate PDF');
      }

      const data = await response.json();
      setPdfUrl(data.pdf_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  }, [profile, template]);

  const handleDownload = useCallback(() => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `${profile.name.replace(/\s+/g, '_')}_Resume.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [pdfUrl, profile.name]);

  const handleTailoredContent = useCallback((tailoredProfile: ResumeProfile) => {
    setProfile(tailoredProfile);
    setPdfUrl(null);
    setActiveTab('edit');
  }, []);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Resume Builder
          </h1>
          <p className="text-muted-foreground">
            Create and tailor your resume with AI assistance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="w-[180px]">
              <Settings2 className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.description}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleGeneratePdf}
            disabled={isGenerating}
            variant="outline"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Preview PDF
              </>
            )}
          </Button>

          {pdfUrl && (
            <Button onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Split screen layout */}
      <div className="grid flex-1 gap-6 overflow-hidden lg:grid-cols-2">
        {/* Left side: Form/Tailoring/Apply */}
        <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'edit' | 'tailor' | 'apply')}
            className="flex h-full flex-col"
          >
            <div className="border-b px-4">
              <TabsList className="h-12 bg-transparent">
                <TabsTrigger value="edit" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="tailor" className="gap-2">
                  <Wand2 className="h-4 w-4" />
                  AI Tailor
                </TabsTrigger>
                <TabsTrigger value="apply" className="gap-2">
                  <Rocket className="h-4 w-4" />
                  Auto Apply
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="edit" className="mt-0 flex-1 overflow-hidden">
              <ResumeForm profile={profile} onChange={handleProfileChange} />
            </TabsContent>

            <TabsContent value="tailor" className="mt-0 flex-1 overflow-hidden">
              <ResumeTailoringPanel
                profile={profile}
                onApplyChanges={handleTailoredContent}
              />
            </TabsContent>

            <TabsContent value="apply" className="mt-0 flex-1 overflow-hidden">
              <AutoApplyPanel
                profile={profile}
                onProfileUpdate={handleProfileChange}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right side: PDF Preview */}
        <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Preview</h2>
            <p className="text-sm text-muted-foreground">
              {pdfUrl
                ? 'Your generated resume'
                : 'Click "Preview PDF" to see your resume'}
            </p>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <ResumePdfPreview pdfUrl={pdfUrl} isGenerating={isGenerating} />
          </div>
        </div>
      </div>
    </div>
  );
}
