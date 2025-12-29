'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  experienceSchema,
  type ExperienceData,
} from '@/lib/validations/onboarding';
import { saveExperience, goToPreviousStep } from '@/app/onboarding/actions';
import { useState, useTransition } from 'react';
import { ONBOARDING_STEPS } from '@/lib/validations/onboarding';

interface ExperienceStepProps {
  initialData?: Partial<ExperienceData>;
  onNext: () => void;
  onBack: () => void;
}

export function ExperienceStep({ initialData, onNext, onBack }: ExperienceStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ExperienceData>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      years_of_experience: initialData?.years_of_experience ?? 0,
      salary_expectation_min: initialData?.salary_expectation_min ?? null,
      salary_expectation_max: initialData?.salary_expectation_max ?? null,
    },
  });

  function onSubmit(data: ExperienceData) {
    setError(null);
    startTransition(async () => {
      const result = await saveExperience(data);
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Something went wrong');
      }
    });
  }

  function handleBack() {
    startTransition(async () => {
      await goToPreviousStep(ONBOARDING_STEPS.EXPERIENCE);
      onBack();
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Experience Level</CardTitle>
        <CardDescription>
          Help us understand your experience level and salary expectations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="years_of_experience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Years of Experience</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Total years of professional experience in your field.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="salary_expectation_min"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Salary (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g., 80000"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseInt(e.target.value) : null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="salary_expectation_max"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum Salary (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g., 120000"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseInt(e.target.value) : null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleBack} disabled={isPending}>
                Back
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Continue'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
