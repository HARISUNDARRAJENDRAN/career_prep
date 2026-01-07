'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, Sparkles, Target, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ResumeProfile } from '@/lib/services/career-automation-client';

interface ResumeTailoringPanelProps {
  profile: ResumeProfile;
  onApplyChanges: (tailoredProfile: ResumeProfile) => void;
}

interface TailoringAnalysis {
  matchScore: number;
  keywordMatches: string[];
  missingKeywords: string[];
  suggestions: Array<{
    section: string;
    original: string;
    improved: string;
    reason: string;
  }>;
  optimizedSummary?: string;
}

export function ResumeTailoringPanel({
  profile,
  onApplyChanges,
}: ResumeTailoringPanelProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TailoringAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(
    new Set()
  );

  const handleAnalyze = useCallback(async () => {
    if (!jobDescription.trim()) {
      setError('Please paste a job description to analyze');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, jobDescription }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to analyze resume');
      }

      const data = await response.json();
      setAnalysis(data);
      // Select all suggestions by default
      setSelectedSuggestions(
        new Set(data.suggestions?.map((_: unknown, i: number) => i) || [])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze resume');
    } finally {
      setIsAnalyzing(false);
    }
  }, [profile, jobDescription]);

  const toggleSuggestion = useCallback((index: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleApplyChanges = useCallback(() => {
    if (!analysis) return;

    let updatedProfile = { ...profile };

    // Apply optimized summary
    if (analysis.optimizedSummary) {
      updatedProfile.summary = analysis.optimizedSummary;
    }

    // Apply selected suggestions
    for (const index of selectedSuggestions) {
      const suggestion = analysis.suggestions[index];
      if (!suggestion) continue;

      // Find and replace in experience bullets
      if (suggestion.section === 'experience') {
        updatedProfile.experience = updatedProfile.experience.map((exp) => ({
          ...exp,
          bullets: exp.bullets.map((bullet) =>
            bullet === suggestion.original ? suggestion.improved : bullet
          ),
        }));
      }

      // Find and replace in project bullets
      if (suggestion.section === 'projects') {
        updatedProfile.projects = updatedProfile.projects.map((proj) => ({
          ...proj,
          bullets: proj.bullets.map((bullet) =>
            bullet === suggestion.original ? suggestion.improved : bullet
          ),
        }));
      }
    }

    // Add missing keywords to skills
    if (analysis.missingKeywords.length > 0) {
      const currentTechnical = updatedProfile.skills?.technical || [];
      const newSkills = analysis.missingKeywords.filter(
        (kw) =>
          !currentTechnical
            .map((s) => s.toLowerCase())
            .includes(kw.toLowerCase())
      );
      updatedProfile.skills = {
        technical: [...currentTechnical, ...newSkills.slice(0, 5)],
        soft: updatedProfile.skills?.soft || [],
        languages: updatedProfile.skills?.languages || [],
      };
    }

    onApplyChanges(updatedProfile);
  }, [analysis, profile, selectedSuggestions, onApplyChanges]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        {/* Job Description Input */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="job-description" className="text-base font-semibold">
              Target Job Description
            </Label>
            <p className="text-sm text-muted-foreground">
              Paste the job description to tailor your resume
            </p>
          </div>
          <Textarea
            id="job-description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here..."
            className="min-h-[200px]"
          />
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !jobDescription.trim()}
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Analyze & Suggest Improvements
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-4">
            {/* Match Score */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Match Score</CardTitle>
                  <Badge
                    variant={
                      analysis.matchScore >= 80
                        ? 'default'
                        : analysis.matchScore >= 60
                          ? 'secondary'
                          : 'destructive'
                    }
                    className="text-lg"
                  >
                    {analysis.matchScore}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${analysis.matchScore}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Keywords */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <CardTitle className="text-sm">Keywords Found</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {analysis.keywordMatches.length > 0 ? (
                      analysis.keywordMatches.map((kw, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {kw}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No matching keywords found
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-500" />
                    <CardTitle className="text-sm">Missing Keywords</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {analysis.missingKeywords.length > 0 ? (
                      analysis.missingKeywords.map((kw, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="border-orange-500/50 text-xs text-orange-600"
                        >
                          {kw}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        All key keywords present
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Suggestions */}
            {analysis.suggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">AI Suggestions</CardTitle>
                  </div>
                  <CardDescription>
                    Select the improvements you want to apply
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysis.suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        selectedSuggestions.has(index)
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleSuggestion(index)}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <Badge variant="outline" className="capitalize">
                          {suggestion.section}
                        </Badge>
                        <div
                          className={`h-4 w-4 rounded-full border-2 ${
                            selectedSuggestions.has(index)
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                          }`}
                        >
                          {selectedSuggestions.has(index) && (
                            <CheckCircle2 className="h-full w-full text-primary-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground">
                            Original:
                          </span>
                          <p className="mt-1 line-through opacity-60">
                            {suggestion.original}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-green-600">
                            Improved:
                          </span>
                          <p className="mt-1">{suggestion.improved}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {suggestion.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Apply Button */}
            <Button
              onClick={handleApplyChanges}
              disabled={selectedSuggestions.size === 0}
              className="w-full"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Apply {selectedSuggestions.size} Selected Changes
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
