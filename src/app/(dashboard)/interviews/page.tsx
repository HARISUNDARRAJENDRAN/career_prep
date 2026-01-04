import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  Clock,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  PlayCircle,
} from 'lucide-react';
import Link from 'next/link';

export default async function InterviewsPage() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // Fetch user's interviews
  const userInterviews = await db.query.interviews.findMany({
    where: eq(interviews.user_id, userId),
    orderBy: [desc(interviews.created_at)],
  });

  // Check if user has completed Reality Check
  const completedRealityCheck = userInterviews.some(
    (i) => i.type === 'reality_check' && i.status === 'completed'
  );

  // Get pending/in-progress interviews
  const pendingInterviews = userInterviews.filter(
    (i) => i.status === 'scheduled' || i.status === 'in_progress'
  );

  // Get completed interviews
  const completedInterviews = userInterviews.filter(
    (i) => i.status === 'completed'
  );

  // Check if Hume is configured
  const isHumeConfigured = !!(
    process.env.HUME_API_KEY && process.env.HUME_SECRET_KEY
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Interviews
        </h1>
        <p className="text-muted-foreground">
          Voice-to-voice interviews powered by Hume AI to verify and grow your
          skills.
        </p>
      </div>

      {/* Pending Interviews - Show at top if any exist */}
      {pendingInterviews.length > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Continue Your Interview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInterviews.map((interview) => (
              <div
                key={interview.id}
                className="flex items-center justify-between p-3 rounded-lg bg-background border"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Mic className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {interview.type === 'reality_check'
                        ? 'Reality Check Interview'
                        : 'Weekly Sprint Interview'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {interview.status === 'in_progress'
                        ? 'In progress - click to resume'
                        : 'Ready to start'}
                    </p>
                  </div>
                </div>
                <Button asChild>
                  <Link href={`/interviews/${interview.id}`}>
                    {interview.status === 'in_progress' ? 'Resume' : 'Start'}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Interview Types */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Reality Check Interview */}
        <Card className="relative overflow-hidden">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-primary/10" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge
                variant={completedRealityCheck ? 'default' : 'secondary'}
                className="w-fit"
              >
                {completedRealityCheck ? 'Completed' : 'Required'}
              </Badge>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="mt-2">Reality Check Interview</CardTitle>
            <CardDescription>
              A comprehensive 30-60 minute interview to establish your baseline
              skill levels. This is the foundation for your personalized
              roadmap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Duration: 30-60 minutes</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span>Voice-to-voice with AI interviewer</span>
              </div>
              {completedRealityCheck ? (
                <div className="space-y-2">
                  <Button className="w-full" size="lg" variant="outline" disabled>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                    Reality Check Completed
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    The Reality Check is a one-time benchmark. Use Weekly Sprints to continue skill verification.
                  </p>
                </div>
              ) : isHumeConfigured ? (
                <Button className="w-full" size="lg" asChild>
                  <Link href="/interviews/new?type=reality_check">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Reality Check
                  </Link>
                </Button>
              ) : (
                <>
                  <Button className="w-full" size="lg" disabled>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Reality Check
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Hume AI not configured. Add HUME_API_KEY to enable.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Sprint Interview */}
        <Card
          className={`relative overflow-hidden ${!completedRealityCheck ? 'opacity-60' : ''}`}
        >
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-orange-500/10" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="w-fit">
                Weekly
              </Badge>
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="mt-2">Weekly Sprint Interview</CardTitle>
            <CardDescription>
              Short 10-15 minute interviews to verify your learning progress and
              update your skill verification status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Duration: 10-15 minutes</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>Focuses on recently learned skills</span>
              </div>
              {completedRealityCheck && isHumeConfigured ? (
                <Button
                  className="w-full"
                  size="lg"
                  variant="outline"
                  asChild
                >
                  <Link href="/interviews/new?type=weekly_sprint">
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule Sprint Interview
                  </Link>
                </Button>
              ) : (
                <Button
                  className="w-full"
                  size="lg"
                  variant="outline"
                  disabled
                >
                  <AlertCircle className="mr-2 h-4 w-4" />
                  {completedRealityCheck
                    ? 'Hume AI Not Configured'
                    : 'Complete Reality Check First'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interview History */}
      <Card>
        <CardHeader>
          <CardTitle>Interview History</CardTitle>
          <CardDescription>
            Your past interviews and verification results
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedInterviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Mic className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">No completed interviews yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Complete your Reality Check Interview to start building your
                verified skill profile.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {interview.type === 'reality_check'
                          ? 'Reality Check Interview'
                          : 'Weekly Sprint Interview'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {interview.completed_at
                          ? new Date(interview.completed_at).toLocaleDateString(
                              'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              }
                            )
                          : 'Completed'}{' '}
                        •{' '}
                        {interview.duration_seconds
                          ? `${Math.round(interview.duration_seconds / 60)} min`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {interview.overall_score && (
                      <Badge variant="secondary">
                        Score: {Number(interview.overall_score).toFixed(0)}%
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/interviews/${interview.id}/summary`}>
                        View Details
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
