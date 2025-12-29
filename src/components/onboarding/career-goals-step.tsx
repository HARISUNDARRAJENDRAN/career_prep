'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  careerGoalsSchema,
  type CareerGoalsData,
  TARGET_ROLE_OPTIONS,
  LOCATION_OPTIONS,
} from '@/lib/validations/onboarding';
import { saveCareerGoals } from '@/app/onboarding/actions';
import { useState, useTransition } from 'react';
import { X } from 'lucide-react';

interface CareerGoalsStepProps {
  initialData?: Partial<CareerGoalsData>;
  onNext: () => void;
}

export function CareerGoalsStep({ initialData, onNext }: CareerGoalsStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CareerGoalsData>({
    resolver: zodResolver(careerGoalsSchema),
    defaultValues: {
      target_roles: initialData?.target_roles || [],
      preferred_locations: initialData?.preferred_locations || [],
    },
  });

  const selectedRoles = form.watch('target_roles');
  const selectedLocations = form.watch('preferred_locations');

  function toggleRole(role: string) {
    const current = form.getValues('target_roles');
    if (current.includes(role)) {
      form.setValue(
        'target_roles',
        current.filter((r) => r !== role),
        { shouldValidate: true }
      );
    } else {
      form.setValue('target_roles', [...current, role], { shouldValidate: true });
    }
  }

  function toggleLocation(location: string) {
    const current = form.getValues('preferred_locations');
    if (current.includes(location)) {
      form.setValue(
        'preferred_locations',
        current.filter((l) => l !== location),
        { shouldValidate: true }
      );
    } else {
      form.setValue('preferred_locations', [...current, location], { shouldValidate: true });
    }
  }

  function onSubmit(data: CareerGoalsData) {
    setError(null);
    startTransition(async () => {
      const result = await saveCareerGoals(data);
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Something went wrong');
      }
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Career Goals</CardTitle>
        <CardDescription>
          Tell us about your career aspirations so we can personalize your experience.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="target_roles"
              render={() => (
                <FormItem>
                  <FormLabel>Target Roles</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_ROLE_OPTIONS.map((role) => (
                        <Badge
                          key={role}
                          variant={selectedRoles.includes(role) ? 'default' : 'outline'}
                          className="cursor-pointer hover:bg-primary/80 transition-colors"
                          onClick={() => toggleRole(role)}
                        >
                          {role}
                          {selectedRoles.includes(role) && (
                            <X className="ml-1 h-3 w-3" />
                          )}
                        </Badge>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preferred_locations"
              render={() => (
                <FormItem>
                  <FormLabel>Preferred Locations</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {LOCATION_OPTIONS.map((location) => (
                        <Badge
                          key={location}
                          variant={selectedLocations.includes(location) ? 'default' : 'outline'}
                          className="cursor-pointer hover:bg-primary/80 transition-colors"
                          onClick={() => toggleLocation(location)}
                        >
                          {location}
                          {selectedLocations.includes(location) && (
                            <X className="ml-1 h-3 w-3" />
                          )}
                        </Badge>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end">
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
