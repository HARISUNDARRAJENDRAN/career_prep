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
  initialStep: OnboardingStep;
  profile: UserProfile | null | undefined;
}

export function OnboardingWizard({ initialStep, profile }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep || ONBOARDING_STEPS.CAREER_GOALS);
  const [parsedResumeData, setParsedResumeData] = useState<any>(null);

  // Calculate progress percentage based on step order
  const stepOrder: OnboardingStep[] = [
    ONBOARDING_STEPS.CAREER_GOALS,
    ONBOARDING_STEPS.EXPERIENCE,
    ONBOARDING_STEPS.EDUCATION,
    ONBOARDING_STEPS.WORK_HISTORY,
    ONBOARDING_STEPS.RESUME_UPLOAD,
    ONBOARDING_STEPS.RESUME_REVIEW,
  ];
  
  const totalSteps = stepOrder.length;
  const currentIndex = stepOrder.indexOf(currentStep);
  const progress = currentStep === ONBOARDING_STEPS.COMPLETE
    ? 100
    : Math.round(((currentIndex + 1) / totalSteps) * 100);

  // Step navigation using step order array
  function goToNext(data?: any) {
    if (data && currentStep === ONBOARDING_STEPS.RESUME_UPLOAD) {
      // Resume data returned - show review step
      setParsedResumeData(data);
    }
    setCurrentStep((prev) => {
      const currentIdx = stepOrder.indexOf(prev);
      if (currentIdx < stepOrder.length - 1) {
        return stepOrder[currentIdx + 1];
      }
      return ONBOARDING_STEPS.COMPLETE;
    });
  }

  function goToPrev() {
    setCurrentStep((prev) => {
      const currentIdx = stepOrder.indexOf(prev);
      if (currentIdx > 0) {
        return stepOrder[currentIdx - 1];
      }
      return stepOrder[0];
    });
  }

  // Get step indicator items with display labels
  const stepItems = [
    { step: ONBOARDING_STEPS.CAREER_GOALS, label: 'Career Goals' },
    { step: ONBOARDING_STEPS.EXPERIENCE, label: 'Experience' },
    { step: ONBOARDING_STEPS.EDUCATION, label: 'Education' },
    { step: ONBOARDING_STEPS.WORK_HISTORY, label: 'Work History' },
    { step: ONBOARDING_STEPS.RESUME_UPLOAD, label: 'Resume' },
    { step: ONBOARDING_STEPS.RESUME_REVIEW, label: 'Review' },
  ];

  // Helper to get step index for comparisons
  const getStepIndex = (step: OnboardingStep) => stepOrder.indexOf(step);
  const currentStepIndex = getStepIndex(currentStep);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      {/* Progress bar */}
      <div className="mb-8">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground text-center mt-2">
          {currentStep === ONBOARDING_STEPS.COMPLETE
            ? 'Complete!'
            : `Step ${currentStepIndex + 1} of ${totalSteps}`}
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex justify-between mb-8">
        {stepItems.map(({ step, label }, index) => {
          const stepIndex = getStepIndex(step);
          const isCompleted = stepIndex < currentStepIndex;
          const isCurrent = step === currentStep;
          
          return (
            <div
              key={step}
              className={`flex flex-col items-center ${
                isCompleted || isCurrent ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                    ? 'border-2 border-primary text-primary'
                    : 'border-2 border-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? '✓' : index + 1}
              </div>
              <span className="text-xs mt-1 hidden sm:block">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {currentStep === ONBOARDING_STEPS.CAREER_GOALS && (
          <CareerGoalsStep
            initialData={{
              targetRoles: profile?.target_roles ?? [],
              preferredLocations: profile?.preferred_locations ?? [],
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

        {currentStep === ONBOARDING_STEPS.RESUME_UPLOAD && (
          <ResumeUploadStep onNext={goToNext} onBack={goToPrev} />
        )}

        {currentStep === ONBOARDING_STEPS.RESUME_REVIEW && parsedResumeData && (
          <ResumeReviewStep
            extractedSkills={parsedResumeData.skills || []}
            projects={parsedResumeData.projects}
            certifications={parsedResumeData.certifications}
            onNext={goToNext}
            onBack={() => {
              setParsedResumeData(null);
              goToPrev();
            }}
          />
        )}

        {currentStep === ONBOARDING_STEPS.RESUME_REVIEW && !parsedResumeData && (
          <ResumeUploadStep onNext={goToNext} onBack={goToPrev} />
        )}

        {currentStep === ONBOARDING_STEPS.COMPLETE && <CompleteStep />}
      </div>
    </div>
  );
}
