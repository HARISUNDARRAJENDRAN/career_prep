'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Plus, CheckCircle2 } from 'lucide-react';
import { confirmResumeSkills } from '@/app/onboarding/actions';

interface ResumeReviewStepProps {
  extractedSkills: string[];
  projects?: Array<{ title: string; description: string }>;
  certifications?: string[];
  onNext: () => void;
  onBack: () => void;
}

export function ResumeReviewStep({
  extractedSkills,
  projects,
  certifications,
  onNext,
  onBack,
}: ResumeReviewStepProps) {
  const [skills, setSkills] = useState<string[]>(extractedSkills);
  const [newSkill, setNewSkill] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemoveSkill(skillToRemove: string) {
    setSkills(skills.filter((s) => s !== skillToRemove));
  }

  function handleAddSkill() {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmResumeSkills({ skills, projects, certifications });
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Failed to save skills');
      }
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Review Extracted Skills</CardTitle>
        <CardDescription>
          We extracted these skills from your resume. Remove incorrect ones or add any we missed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Skills Tag Cloud */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Skills ({skills.length})</h4>
          <div className="flex flex-wrap gap-2 min-h-[100px] p-4 border rounded-lg bg-muted/30">
            {skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills extracted. Add some below.</p>
            ) : (
              skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="px-3 py-1.5 text-sm">
                  {skill}
                  <button
                    onClick={() => handleRemoveSkill(skill)}
                    className="ml-2 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* Add New Skill */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a skill..."
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSkill();
              }
            }}
          />
          <Button type="button" onClick={handleAddSkill} variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Projects Preview (Read-only for now) */}
        {projects && projects.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Projects ({projects.length})</h4>
            <div className="space-y-2">
              {projects.map((project, idx) => (
                <div key={idx} className="p-3 border rounded-lg bg-muted/20">
                  <p className="font-medium text-sm">{project.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications Preview */}
        {certifications && certifications.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Certifications ({certifications.length})</h4>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert) => (
                <Badge key={cert} variant="outline">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {cert}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || skills.length === 0}>
            {isPending ? 'Saving...' : 'Confirm & Continue'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
