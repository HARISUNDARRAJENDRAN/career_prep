'use client';

import * as React from 'react';
import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface ManualApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobListingId: string;
  company: string;
  role: string;
}

export function ManualApplyModal({
  isOpen,
  onClose,
  jobListingId,
  company,
  role,
}: ManualApplyModalProps) {
  const [appliedDate, setAppliedDate] = useState<Date>(new Date());
  const [hasConfirmation, setHasConfirmation] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/agents/apply/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_listing_id: jobListingId,
          applied_at: appliedDate.toISOString(),
          has_confirmation: hasConfirmation,
          notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to record application');
      }

      const data = await response.json();

      toast.success('Application recorded!', {
        description: `Tracking your application to ${company}. We'll monitor for updates.`,
        icon: <CheckCircle2 className="h-4 w-4" />,
      });

      // Reset form and close
      setNotes('');
      setHasConfirmation(false);
      setAppliedDate(new Date());
      onClose();
    } catch (error) {
      toast.error('Failed to record application', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Manual Application</DialogTitle>
          <DialogDescription>
            Track your application to <span className="font-medium">{role}</span> at{' '}
            <span className="font-medium">{company}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Application Date */}
          <div className="space-y-2">
            <Label>When did you apply?</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !appliedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {appliedDate ? format(appliedDate, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={appliedDate}
                  onSelect={(date) => date && setAppliedDate(date)}
                  disabled={(date) => date > new Date() || date < new Date('2020-01-01')}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Confirmation Email */}
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Got confirmation email?</Label>
              <p className="text-xs text-muted-foreground">
                Did you receive an application confirmation?
              </p>
            </div>
            <Switch checked={hasConfirmation} onCheckedChange={setHasConfirmation} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="E.g., Applied via referral, contacted hiring manager, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Recording...' : 'Record Application'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
