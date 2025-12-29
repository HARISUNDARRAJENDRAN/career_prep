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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  educationSchema,
  type EducationData,
  DEGREE_OPTIONS,
  ONBOARDING_STEPS,
} from '@/lib/validations/onboarding';
import { saveEducation, goToPreviousStep } from '@/app/onboarding/actions';
import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface EducationStepProps {
  initialData?: EducationData['education'];
  onNext: () => void;
  onBack: () => void;
}

export function EducationStep({ initialData, onNext, onBack }: EducationStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<EducationData>({
    resolver: zodResolver(educationSchema),
    defaultValues: {
      education: initialData?.length
        ? initialData
        : [{ degree: '', institution: '', field_of_study: '', start_date: '', end_date: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'education',
  });

  function onSubmit(data: EducationData) {
    setError(null);
    startTransition(async () => {
      const result = await saveEducation(data);
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Something went wrong');
      }
    });
  }

  function handleBack() {
    startTransition(async () => {
      await goToPreviousStep(ONBOARDING_STEPS.EDUCATION);
      onBack();
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Education</CardTitle>
        <CardDescription>
          Add your educational background. This helps us tailor your career roadmap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 border rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Education {index + 1}</h4>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name={`education.${index}.degree`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Degree</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select degree" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DEGREE_OPTIONS.map((degree) => (
                              <SelectItem key={degree} value={degree}>
                                {degree}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`education.${index}.institution`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Institution</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., MIT" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name={`education.${index}.field_of_study`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Field of Study (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Computer Science"
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
                    name={`education.${index}.start_date`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="month" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`education.${index}.end_date`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="month" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append({
                  degree: '',
                  institution: '',
                  field_of_study: '',
                  start_date: '',
                  end_date: '',
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Another Education
            </Button>

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
