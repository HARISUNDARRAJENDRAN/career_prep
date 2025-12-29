'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  workHistoryFormSchema,
  type WorkHistoryData,
  ONBOARDING_STEPS,
} from '@/lib/validations/onboarding';
import { saveWorkHistory, skipWorkHistory, goToPreviousStep } from '@/app/onboarding/actions';
import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface WorkHistoryStepProps {
  initialData?: WorkHistoryData['work_history'];
  onNext: () => void;
  onBack: () => void;
}

export function WorkHistoryStep({ initialData, onNext, onBack }: WorkHistoryStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<WorkHistoryData>({
    resolver: zodResolver(workHistoryFormSchema),
    defaultValues: {
      work_history: initialData?.length ? initialData : [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'work_history',
  });

  function onSubmit(data: WorkHistoryData) {
    setError(null);
    startTransition(async () => {
      const result = await saveWorkHistory(data);
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Something went wrong');
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await skipWorkHistory();
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Something went wrong');
      }
    });
  }

  function handleBack() {
    startTransition(async () => {
      await goToPreviousStep(ONBOARDING_STEPS.WORK_HISTORY);
      onBack();
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Work History</CardTitle>
        <CardDescription>
          Add your work experience. This is optional but helps us understand your background better.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No work experience added yet.</p>
                <p className="text-sm mt-1">Click below to add your first position, or skip this step.</p>
              </div>
            ) : (
              fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Position {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`work_history.${index}.title`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Title</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Software Engineer" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`work_history.${index}.company`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Google" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`work_history.${index}.location`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., San Francisco, CA"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`work_history.${index}.start_date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="month" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`work_history.${index}.end_date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date (Leave empty if current)</FormLabel>
                          <FormControl>
                            <Input type="month" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`work_history.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your responsibilities and achievements..."
                            className="resize-none"
                            rows={3}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append({
                  title: '',
                  company: '',
                  location: '',
                  start_date: '',
                  end_date: '',
                  description: '',
                  skills_used: [],
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Work Experience
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleBack} disabled={isPending}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={handleSkip} disabled={isPending}>
                  Skip
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Saving...' : 'Continue'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
