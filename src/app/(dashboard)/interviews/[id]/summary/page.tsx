import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/drizzle/db';
import { interviews, skillVerifications } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  Clock,
  ArrowLeft,
  Trophy,
  TrendingUp,
  Brain,
  Smile,
  Frown,
  Meh,
} from 'lucide-react';
import Link from 'next/link';

interface SummaryPageProps {
  params: Promise<{ id: string }>;
}

export default async function InterviewSummaryPage({
  params,
}: SummaryPageProps) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    redirect('/sign-in');
  }

  // Fetch the interview
  const interview = await db.query.interviews.findFirst({
    where: and(eq(interviews.id, id), eq(interviews.user_id, userId)),
  });

  if (!interview) {
    notFound();
  }

  // If not completed, redirect to session
  if (interview.status !== 'completed') {
    redirect(`/interviews/${id}`);
  }

  // Fetch skill verifications from this interview with related data
  const verifications = await db.query.skillVerifications.findMany({
    where: eq(skillVerifications.interview_id, id),
    with: {
      userSkill: {
        with: {
          skill: true,
        },
      },
    },
  });

  // Parse transcript and emotion summary from raw_data
  const rawData = interview.raw_data as {
    transcript?: Array<{
      speaker: string;
      text: string;
      timestamp: string;
      emotions?: Record<string, number>;
    }>;
    emotion_summary?: Record<string, number>;
  } | null;

  const transcript = rawData?.transcript || [];
  const emotionSummary = rawData?.emotion_summary || {};

  // Calculate stats
  const userMessages = transcript.filter((t) => t.speaker === 'user');
  const agentMessages = transcript.filter((t) => t.speaker === 'agent');
  const durationMinutes = interview.duration_seconds
    ? Math.round(interview.duration_seconds / 60)
    : 0;

  // Determine overall mood from emotions
  const topEmotion = Object.entries(emotionSummary).sort(
    ([, a], [, b]) => b - a
  )[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/interviews">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Interview Summary
          </h1>
          <p className="text-muted-foreground">
            {interview.type === 'reality_check'
              ? 'Reality Check Interview'
              : 'Weekly Sprint Interview'}{' '}
            •{' '}
            {interview.completed_at
              ? new Date(interview.completed_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Completed'}
          </p>
        </div>
      </div>

      {/* Score Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Overall Score */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Overall Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold">
                {interview.overall_score
                  ? `${Number(interview.overall_score).toFixed(0)}%`
                  : 'N/A'}
              </div>
              <div className="flex-1">
                <Progress
                  value={Number(interview.overall_score) || 0}
                  className="h-3"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{durationMinutes} min</div>
            <p className="text-sm text-muted-foreground mt-1">
              {userMessages.length} responses • {agentMessages.length} questions
            </p>
          </CardContent>
        </Card>

        {/* Dominant Emotion */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              Dominant Mood
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {getEmotionIcon(topEmotion?.[0])}
              <div>
                <div className="text-2xl font-bold">
                  {topEmotion?.[0] || 'N/A'}
                </div>
                <p className="text-sm text-muted-foreground">
                  {topEmotion
                    ? `${Math.round(topEmotion[1] * 100)}% confidence`
                    : 'No emotion data'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Skill Verifications */}
      {verifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Skills Verified
            </CardTitle>
            <CardDescription>
              Skills assessed during this interview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {verifications.map((v) => {
                const skillName = v.userSkill?.skill?.name || 'Unknown Skill';
                const proficiencyLevel = v.userSkill?.proficiency_level || 'learning';
                const confidenceScore = v.raw_data?.confidence_score;

                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{skillName}</p>
                      <p className="text-sm text-muted-foreground">
                        Level: {proficiencyLevel}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          (confidenceScore ?? 0) >= 0.7
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {confidenceScore
                          ? `${Math.round(confidenceScore * 100)}%`
                          : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emotion Breakdown */}
      {Object.keys(emotionSummary).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Emotional Analysis
            </CardTitle>
            <CardDescription>
              Average emotional indicators during the interview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(emotionSummary)
                .sort(([, a], [, b]) => b - a)
                .map(([emotion, score]) => (
                  <div key={emotion} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{emotion}</span>
                      <span className="text-muted-foreground">
                        {Math.round(score * 100)}%
                      </span>
                    </div>
                    <Progress value={score * 100} className="h-2" />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation Highlights</CardTitle>
          <CardDescription>Key moments from your interview</CardDescription>
        </CardHeader>
        <CardContent>
          {transcript.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No transcript available
            </p>
          ) : (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {transcript.slice(0, 10).map((msg, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    msg.speaker === 'user'
                      ? 'bg-primary/10 ml-8'
                      : 'bg-muted mr-8'
                  }`}
                >
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {msg.speaker === 'user' ? 'You' : 'Interviewer'}
                  </p>
                  <p className="text-sm">{msg.text}</p>
                </div>
              ))}
              {transcript.length > 10 && (
                <p className="text-center text-sm text-muted-foreground">
                  ... and {transcript.length - 10} more messages
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/interviews">Back to Interviews</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/roadmap">View Your Roadmap</Link>
        </Button>
      </div>
    </div>
  );
}

function getEmotionIcon(emotion?: string) {
  if (!emotion) return <Meh className="h-8 w-8 text-muted-foreground" />;

  const positiveEmotions = [
    'Interest',
    'Determination',
    'Concentration',
    'Excitement',
    'Joy',
  ];
  const negativeEmotions = ['Anxiety', 'Confusion', 'Frustration', 'Fear'];

  if (positiveEmotions.some((e) => emotion.includes(e))) {
    return <Smile className="h-8 w-8 text-green-500" />;
  }
  if (negativeEmotions.some((e) => emotion.includes(e))) {
    return <Frown className="h-8 w-8 text-amber-500" />;
  }
  return <Meh className="h-8 w-8 text-blue-500" />;
}
