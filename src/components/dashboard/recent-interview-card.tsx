'use client';

import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Clock,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  Lightbulb,
  ArrowRight,
  Mic,
  Calendar,
} from 'lucide-react';

export type RecentInterviewData = {
  id: string;
  type: 'reality_check' | 'weekly_sprint';
  completedAt: string;
  durationSeconds: number;
  overallScore: number;
  communicationScore: number;
  selfAwarenessScore: number;
  careerAlignmentScore: number;
  dominantEmotion?: string;
  skillsVerified: string[];
  topRecommendation?: string;
};

type Props = {
  interview: RecentInterviewData | null;
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10';
  if (score >= 60) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

export function RecentInterviewCard({ interview }: Props) {
  if (!interview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Latest Interview
          </CardTitle>
          <CardDescription>
            Your most recent interview summary
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground mb-4">
            No interviews completed yet
          </p>
          <Button asChild>
            <Link href="/interviews/new">
              Schedule Interview
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const completedDate = new Date(interview.completedAt);
  const typeLabel = interview.type === 'reality_check' ? 'Reality Check' : 'Weekly Sprint';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Latest Interview
            </CardTitle>
            <CardDescription className="mt-1">
              {typeLabel} - {completedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </CardDescription>
          </div>
          <Badge variant={interview.type === 'reality_check' ? 'default' : 'secondary'}>
            {typeLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`flex items-center justify-center rounded-xl p-6 ${getScoreBgColor(interview.overallScore)}`}
        >
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Overall Score</p>
            <p className={`text-4xl font-bold ${getScoreColor(interview.overallScore)}`}>
              {interview.overallScore}%
            </p>
          </div>
        </motion.div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Score Breakdown</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Communication
                </span>
                <span className="font-medium">{interview.communicationScore}%</span>
              </div>
              <Progress value={interview.communicationScore} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  Self-Awareness
                </span>
                <span className="font-medium">{interview.selfAwarenessScore}%</span>
              </div>
              <Progress value={interview.selfAwarenessScore} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Career Alignment
                </span>
                <span className="font-medium">{interview.careerAlignmentScore}%</span>
              </div>
              <Progress value={interview.careerAlignmentScore} className="h-1.5" />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-medium">{formatDuration(interview.durationSeconds)}</p>
            </div>
          </div>
          {interview.dominantEmotion && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <span className="text-lg">
                {interview.dominantEmotion === 'confidence' && '💪'}
                {interview.dominantEmotion === 'enthusiasm' && '🎉'}
                {interview.dominantEmotion === 'calmness' && '😌'}
                {interview.dominantEmotion === 'anxiety' && '😰'}
                {interview.dominantEmotion === 'uncertainty' && '🤔'}
                {!['confidence', 'enthusiasm', 'calmness', 'anxiety', 'uncertainty'].includes(interview.dominantEmotion) && '😊'}
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Dominant</p>
                <p className="text-sm font-medium capitalize">{interview.dominantEmotion}</p>
              </div>
            </div>
          )}
        </div>

        {/* Skills Verified */}
        {interview.skillsVerified.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Skills Verified
            </p>
            <div className="flex flex-wrap gap-1.5">
              {interview.skillsVerified.slice(0, 5).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {interview.skillsVerified.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{interview.skillsVerified.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Top Recommendation */}
        {interview.topRecommendation && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-1">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Top Recommendation
            </p>
            <p className="text-sm text-muted-foreground">
              {interview.topRecommendation}
            </p>
          </div>
        )}

        {/* View Details */}
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/interviews/${interview.id}/summary`}>
            View Full Summary
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
