'use client';

import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { ONBOARDING_STEPS, STEP_LABELS, type OnboardingStep } from '@/lib/validations/onboarding';
import { CareerGoalsStep } from './career-goals-step';
import { ExperienceStep } from './experience-step';
import { EducationStep } from './education-step';
import { WorkHistoryStep } from './work-history-step';
import { ResumeUploadStep } from './resume-upload-step';
import { ResumeReviewStep } from './resume-review-step';
import { CompleteStep } from './complete-step';
import type { UserProfile } from '@/drizzle/schema/user-profiles';

interface OnboardingWizardProps {
  initialStep: number;
  profile: UserProfile | null | undefined;
}

export function OnboardingWizard({ initialStep, profile }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    Math.max(ONBOARDING_STEPS.CAREER_GOALS, initialStep) as OnboardingStep
  );
  const [parsedResumeData, setParsedResumeData] = useState<any>(null);

  // Calculate progress percentage (steps 1-5, welcome step 0 not counted)
  const totalSteps = 5; // Career Goals, Experience, Education, Work History, Resume
  const progressStep = Math.min(currentStep, ONBOARDING_STEPS.COMPLETE) - 1;
  const progress = currentStep >= ONBOARDING_STEPS.COMPLETE
    ? 100
    : Math.round((progressStep / totalSteps) * 100);

  // Step navigation
  function goToNext(data?: any) {
    if (data && currentStep === ONBOARDING_STEPS.RESUME) {
      // Resume data returned - show review step
      setParsedResumeData(data);
    }
    setCurrentStep((prev) => Math.min(prev + 1, ONBOARDING_STEPS.COMPLETE) as OnboardingStep);
  }

  function goToPrev() {
    setCurrentStep((prev) => Math.max(prev - 1, ONBOARDING_STEPS.CAREER_GOALS) as OnboardingStep);
  }

  // Get step indicator items
  const stepItems = [
    { step: ONBOARDING_STEPS.CAREER_GOALS, label: 'Career Goals' },
    { step: ONBOARDING_STEPS.EXPERIENCE, label: 'Experience' },
    { step: ONBOARDING_STEPS.EDUCATION, label: 'Education' },
    { step: ONBOARDING_STEPS.WORK_HISTORY, label: 'Work History' },
    { step: ONBOARDING_STEPS.RESUME, label: 'Resume' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      {/* Progress bar */}
      <div className="mb-8">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground text-center mt-2">
          {currentStep >= ONBOARDING_STEPS.COMPLETE
            ? 'Complete!'
            : `Step ${currentStep} of ${totalSteps}`}
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex justify-between mb-8">
        {stepItems.map(({ step, label }) => (
          <div
            key={step}
            className={`flex flex-col items-center ${
              step <= currentStep ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step < currentStep
                  ? 'bg-primary text-primary-foreground'
                  : step === currentStep
                  ? 'border-2 border-primary text-primary'
                  : 'border-2 border-muted text-muted-foreground'
              }`}
            >
              {step < currentStep ? '✓' : step}
            </div>
            <span className="text-xs mt-1 hidden sm:block">{label}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {currentStep === ONBOARDING_STEPS.CAREER_GOALS && (
          <CareerGoalsStep
            initialData={{
              target_roles: profile?.target_roles ?? [],
              preferred_locations: profile?.preferred_locations ?? [],
            }}
            onNext={goToNext}
          />
        )}

        {currentStep === ONBOARDING_STEPS.EXPERIENCE && (
          <ExperienceStep
            initialData={{
              years_of_experience: profile?.years_of_experience ?? 0,
              salary_expectation_min: profile?.salary_expectation_min,
              salary_expectation_max: profile?.salary_expectation_max,
            }}
            onNext={goToNext}
            onBack={goToPrev}
          />
        )}

        {currentStep === ONBOARDING_STEPS.EDUCATION && (
          <EducationStep
            initialData={profile?.education ?? undefined}
            onNext={goToNext}
            onBack={goToPrev}
          />
        )}

        {currentStep === ONBOARDING_STEPS.WORK_HISTORY && (
          <WorkHistoryStep
            initialData={profile?.work_history ?? undefined}
            onNext={goToNext}
            onBack={goToPrev}
          />
        )}

        {currentStep === ONBOARDING_STEPS.RESUME && !parsedResumeData && (
          <ResumeUploadStep onNext={goToNext} onBack={goToPrev} />
        )}

        {currentStep === ONBOARDING_STEPS.RESUME && parsedResumeData && (
          <ResumeReviewStep
            extractedSkills={parsedResumeData.skills || []}
            projects={parsedResumeData.projects}
            certifications={parsedResumeData.certifications}
            onNext={goToNext}
            onBack={() => setParsedResumeData(null)}
          />
        )}

        {currentStep === ONBOARDING_STEPS.COMPLETE && <CompleteStep />}
      </div>
    </div>
  );
}
