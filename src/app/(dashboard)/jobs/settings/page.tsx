'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Zap,
  Shield,
  AlertTriangle,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Upload,
  FileText,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface AutoApplySettings {
  enabled: boolean;
  threshold: number;
  daily_limit: number;
  excluded_companies: string[];
  require_review: boolean;
  resume_is_embedded: boolean;
  resume_embedded_at: string | null;
  resume_filename?: string;
}

export default function AutoApplySettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<AutoApplySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newCompany, setNewCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Fetch current settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/applications/settings');
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings);
        } else {
          // No settings yet, use defaults
          setSettings({
            enabled: false,
            threshold: 75,
            daily_limit: 5,
            excluded_companies: [],
            require_review: true,
            resume_is_embedded: false,
            resume_embedded_at: null,
          });
        }
      } catch (err) {
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  // Save settings
  async function handleSave() {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/applications/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: settings.enabled,
          threshold: settings.threshold,
          daily_limit: settings.daily_limit,
          excluded_companies: settings.excluded_companies,
          require_review: settings.require_review,
        }),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  // Add excluded company
  function addExcludedCompany() {
    if (!settings || !newCompany.trim()) return;

    const company = newCompany.trim();
    if (!settings.excluded_companies.includes(company)) {
      setSettings({
        ...settings,
        excluded_companies: [...settings.excluded_companies, company],
      });
    }
    setNewCompany('');
  }

  // Remove excluded company
  function removeExcludedCompany(company: string) {
    if (!settings) return;

    setSettings({
      ...settings,
      excluded_companies: settings.excluded_companies.filter((c) => c !== company),
    });
  }

  // Handle resume upload
  async function handleResumeUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/resume/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadSuccess(data.message || 'Resume uploaded successfully!');
        // Update settings to reflect new resume
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                resume_is_embedded: true,
                resume_embedded_at: new Date().toISOString(),
                resume_filename: file.name,
              }
            : prev
        );
        setTimeout(() => setUploadSuccess(null), 5000);
      } else {
        setError(data.error || 'Failed to upload resume');
      }
    } catch (err) {
      setError('Failed to upload resume. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/jobs/applications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auto-Apply Settings</h1>
          <p className="text-muted-foreground">
            Configure how the Action Agent applies to jobs on your behalf
          </p>
        </div>
      </div>

      {/* Resume Embedding Status */}
      <Card className={settings.resume_is_embedded ? 'border-green-500/50' : 'border-yellow-500/50'}>
        <CardHeader>
          <div className="flex items-center gap-2">
            {settings.resume_is_embedded ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
            <CardTitle className="text-lg">Resume Embedding</CardTitle>
          </div>
          <CardDescription>
            {settings.resume_is_embedded
              ? `Your resume is embedded for RAG-powered cover letters. Last updated: ${
                  settings.resume_embedded_at
                    ? new Date(settings.resume_embedded_at).toLocaleDateString()
                    : 'Unknown'
                }`
              : 'Upload a resume to enable AI-powered cover letter generation'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current resume info */}
          {settings.resume_is_embedded && settings.resume_filename && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Current file: {settings.resume_filename}</span>
            </div>
          )}

          {/* Upload success message */}
          {uploadSuccess && (
            <div className="bg-green-500/10 text-green-600 px-4 py-3 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {uploadSuccess}
            </div>
          )}

          {/* File upload input (hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleResumeUpload}
            className="hidden"
            id="resume-upload"
          />

          {/* Upload buttons */}
          <div className="flex gap-2">
            <Button
              variant={settings.resume_is_embedded ? 'outline' : 'default'}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : settings.resume_is_embedded ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Update Resume
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Resume
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Accepted formats: PDF, DOCX. Max size: 5MB
          </p>
        </CardContent>
      </Card>

      {/* Main Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle>Auto-Apply Configuration</CardTitle>
          </div>
          <CardDescription>
            When enabled, the Action Agent will automatically generate cover letters
            and apply to jobs that match your profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-apply-enabled">Enable Auto-Apply</Label>
              <p className="text-sm text-muted-foreground">
                Allow the agent to apply to matching jobs
              </p>
            </div>
            <Switch
              id="auto-apply-enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
            />
          </div>

          {/* Threshold Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Match Score Threshold</Label>
              <span className="text-sm font-medium">{settings.threshold}%</span>
            </div>
            <Slider
              value={[settings.threshold]}
              onValueChange={(values: number[]) => setSettings({ ...settings, threshold: values[0] })}
              min={50}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Only apply to jobs with a match score of {settings.threshold}% or higher
            </p>
          </div>

          {/* Daily Limit */}
          <div className="space-y-2">
            <Label htmlFor="daily-limit">Daily Application Limit</Label>
            <div className="flex items-center gap-2">
              <Input
                id="daily-limit"
                type="number"
                min={1}
                max={20}
                value={settings.daily_limit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    daily_limit: Math.min(20, Math.max(1, parseInt(e.target.value) || 5)),
                  })
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">applications per day</span>
            </div>
          </div>

          {/* Require Review Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-review" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Require Review Before Sending
              </Label>
              <p className="text-sm text-muted-foreground">
                Applications will be saved as drafts for your approval
              </p>
            </div>
            <Switch
              id="require-review"
              checked={settings.require_review}
              onCheckedChange={(checked) => setSettings({ ...settings, require_review: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Excluded Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Excluded Companies</CardTitle>
          <CardDescription>
            The agent will not apply to jobs from these companies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Company name..."
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExcludedCompany()}
            />
            <Button variant="outline" onClick={addExcludedCompany}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {settings.excluded_companies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {settings.excluded_companies.map((company) => (
                <Badge key={company} variant="secondary" className="gap-1 pr-1">
                  {company}
                  <button
                    onClick={() => removeExcludedCompany(company)}
                    className="ml-1 hover:bg-muted rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 text-green-600 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved successfully
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/jobs/applications">Cancel</Link>
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
    </div>
  );
}
