'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface InterviewTimerProps {
  startTime: Date;
}

/**
 * Displays elapsed time since the interview started.
 */
export function InterviewTimer({ startTime }: InterviewTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const timeString =
    hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2 text-lg font-mono">
      <Clock className="h-5 w-5 text-muted-foreground" />
      <span>{timeString}</span>
    </div>
  );
}
