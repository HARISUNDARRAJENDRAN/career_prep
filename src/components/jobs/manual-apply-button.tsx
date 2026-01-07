'use client';

import * as React from 'react';
import { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManualApplyModal } from './manual-apply-modal';

interface ManualApplyButtonProps {
  jobListingId: string;
  company: string;
  role: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export function ManualApplyButton({
  jobListingId,
  company,
  role,
  size = 'default',
  variant = 'outline',
}: ManualApplyButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => setIsModalOpen(true)}
        className="gap-2"
      >
        <CheckSquare className="h-4 w-4" />
        I Applied
      </Button>

      <ManualApplyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        jobListingId={jobListingId}
        company={company}
        role={role}
      />
    </>
  );
}
