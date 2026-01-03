'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HumeMessage = any;

interface EmotionIndicatorProps {
  messages: HumeMessage[];
  micFft?: Float32Array | number[] | null;
}

// Top emotions we care about for interviews
const TRACKED_EMOTIONS = [
  'Concentration',
  'Contemplation',
  'Interest',
  'Determination',
  'Confusion',
  'Anxiety',
] as const;

/**
 * Displays real-time emotional analysis from Hume's prosody model.
 */
export function EmotionIndicator({ messages, micFft }: EmotionIndicatorProps) {
  // Get the latest user message with emotions
  const latestUserMessage = [...messages]
    .reverse()
    .find((m) => m.type === 'user_message' && m.models?.prosody?.scores);

  const emotions = latestUserMessage?.models?.prosody?.scores || {};

  // Calculate audio level from FFT
  const audioLevel = micFft
    ? Math.min(
        100,
        (Array.from(micFft).reduce((a, b) => a + Math.abs(b), 0) /
          micFft.length) *
          200
      )
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Emotional Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Audio Level Indicator */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Voice Activity</span>
            <span className="text-muted-foreground">
              {Math.round(audioLevel)}%
            </span>
          </div>
          <Progress value={audioLevel} className="h-2" />
        </div>

        <div className="h-px bg-border my-4" />

        {/* Tracked Emotions */}
        <div className="space-y-3">
          {TRACKED_EMOTIONS.map((emotion) => {
            const score = emotions[emotion] || 0;
            const percentage = Math.round(score * 100);

            return (
              <div key={emotion} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{emotion}</span>
                  <span className="text-muted-foreground">{percentage}%</span>
                </div>
                <Progress
                  value={percentage}
                  className={`h-1.5 ${getEmotionColor(emotion)}`}
                />
              </div>
            );
          })}
        </div>

        {Object.keys(emotions).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Start speaking to see emotional analysis...
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function getEmotionColor(emotion: string): string {
  switch (emotion) {
    case 'Concentration':
    case 'Interest':
    case 'Determination':
      return '[&>div]:bg-green-500';
    case 'Anxiety':
    case 'Confusion':
      return '[&>div]:bg-amber-500';
    default:
      return '';
  }
}
