import { currentUser } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { userProfiles, userSkills, interviews, jobApplications, skills } from '@/drizzle/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Zap,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  AnimatedStatsCard,
  AnimatedSection,
  QuickActions,
  ActivityTimeline,
  MarketPulse,
  InterviewTrendsChart,
  RecentInterviewCard,
  SkillsRadarChart,
  WeeklyGoals,
  CareerInsights,
  ProgressStreak,
  type ActivityEvent,
  type TrendingSkill,
  type InterviewTrendData,
  type RecentInterviewData,
  type WeeklyGoal,
} from '@/components/dashboard';

export default async function DashboardPage() {
  const user = await currentUser();

  // Fetch user profile and skills
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, user!.id),
  });

  const userSkillsData = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, user!.id),
    with: {
      skill: true,
    },
    orderBy: [desc(userSkills.updated_at)],
  });

  // Fetch all interviews for the user
  const userInterviews = await db.query.interviews.findMany({
    where: eq(interviews.user_id, user!.id),
    orderBy: [desc(interviews.created_at)],
  });

  // Fetch job applications for this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyApplications = await db.query.jobApplications.findMany({
    where: and(
      eq(jobApplications.user_id, user!.id),
      gte(jobApplications.created_at, startOfMonth)
    ),
  });

  // Fetch trending skills for market pulse
  const trendingSkills = await db.query.skills.findMany({
    orderBy: [desc(skills.demand_score)],
    limit: 10,
  });

  // Calculate stats
  const totalSkills = userSkillsData.length;
  const verifiedSkills = userSkillsData.filter(
    (s) => s.verification_metadata?.is_verified
  ).length;
  const gapsFound = userSkillsData.filter(
    (s) => s.verification_metadata?.gap_identified
  ).length;
  const targetRoles = profile?.target_roles || [];
  const verificationProgress =
    totalSkills > 0 ? Math.round((verifiedSkills / totalSkills) * 100) : 0;

  // Interview stats
  const completedInterviews = userInterviews.filter(i => i.status === 'completed').length;
  const realityCheckCompleted = userInterviews.some(
    i => i.type === 'reality_check' && i.status === 'completed'
  );
  const weeklySprintCount = userInterviews.filter(
    i => i.type === 'weekly_sprint' && i.status === 'completed'
  ).length;
  const latestInterview = userInterviews.find(i => i.status === 'completed');

  // Transform completed interviews for trends chart
  const interviewTrendData: InterviewTrendData[] = userInterviews
    .filter(i => i.status === 'completed' && i.completed_at)
    .map(i => ({
      id: i.id,
      date: i.completed_at!.toISOString(),
      overallScore: i.overall_score ? parseFloat(i.overall_score) : 0,
      communicationScore: i.raw_data?.analysis?.communication_score || 0,
      selfAwarenessScore: i.raw_data?.analysis?.self_awareness_score || 0,
      careerAlignmentScore: i.raw_data?.analysis?.career_alignment_score || 0,
      type: i.type,
    }))
    .reverse();

  // Transform latest interview for recent card
  const recentInterviewData: RecentInterviewData | null = latestInterview && latestInterview.status === 'completed'
    ? {
        id: latestInterview.id,
        type: latestInterview.type,
        completedAt: latestInterview.completed_at?.toISOString() || '',
        durationSeconds: latestInterview.duration_seconds || 0,
        overallScore: latestInterview.overall_score ? parseFloat(latestInterview.overall_score) : 0,
        communicationScore: latestInterview.raw_data?.analysis?.communication_score || 0,
        selfAwarenessScore: latestInterview.raw_data?.analysis?.self_awareness_score || 0,
        careerAlignmentScore: latestInterview.raw_data?.analysis?.career_alignment_score || 0,
        dominantEmotion: getDominantEmotion(latestInterview.raw_data?.emotion_summary),
        skillsVerified: latestInterview.raw_data?.analysis?.skills_assessed
          ?.filter(s => !s.gap_identified)
          .map(s => s.skill_name) || [],
        topRecommendation: latestInterview.raw_data?.analysis?.skills_assessed
          ?.find(s => s.recommendations?.length > 0)
          ?.recommendations?.[0],
      }
    : null;

  // Job application stats
  const totalApplicationsThisMonth = monthlyApplications.length;
  const activeApplications = monthlyApplications.filter(
    a => a.status === 'applied' || a.status === 'interviewing'
  ).length;

  // Build activity events
  const activityEvents: ActivityEvent[] = buildActivityEvents({
    interviews: userInterviews,
    skills: userSkillsData,
  });

  // Build market pulse data
  const userSkillNames = new Set(userSkillsData.map(s => s.skill?.name?.toLowerCase()));
  const marketPulseData: TrendingSkill[] = trendingSkills
    .filter(s => s.demand_score)
    .map(s => ({
      name: s.name,
      demandScore: s.demand_score ? parseFloat(s.demand_score) : 0,
      trend: 'stable' as const,
      category: s.category || undefined,
      userHasSkill: userSkillNames.has(s.name.toLowerCase()),
    }));

  // Determine next steps based on user progress
  const nextSteps = getNextSteps({
    hasSkills: totalSkills > 0,
    realityCheckCompleted,
    verifiedSkills,
    totalSkills,
    gapsFound,
    hasRoadmap: false,
  });

  // Calculate streak and weekly activity
  const streakData = calculateStreakData(userInterviews);

  // Build weekly goals based on user progress
  const weeklyGoals: WeeklyGoal[] = buildWeeklyGoals({
    hasCompletedInterview: completedInterviews > 0,
    hasSkills: totalSkills > 0,
    realityCheckCompleted,
    gapsFound,
  });

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <AnimatedSection delay={0}>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Welcome back, {user?.firstName || 'there'}!
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your career preparation journey.
          </p>
        </div>
      </AnimatedSection>

      {/* Quick Actions */}
      <QuickActions
        hasCompletedRealityCheck={realityCheckCompleted}
        hasSkills={totalSkills > 0}
      />

      {/* Progress Streak and Weekly Goals - Top Section */}
      <AnimatedSection delay={0.2}>
        <div className="grid gap-4 md:grid-cols-2">
          <ProgressStreak
            currentStreak={streakData.currentStreak}
            longestStreak={streakData.longestStreak}
            totalInterviews={completedInterviews}
            lastActivityDate={streakData.lastActivityDate}
            weeklyActivity={streakData.weeklyActivity}
          />
          <WeeklyGoals
            goals={weeklyGoals}
            completedInterviews={weeklySprintCount}
            targetInterviews={2}
          />
        </div>
      </AnimatedSection>

      {/* Animated Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AnimatedStatsCard
          title="Target Roles"
          value={targetRoles.length}
          subtitle={targetRoles.slice(0, 2).join(', ') || 'Not set'}
          icon="target"
          index={0}
          accentColor="#10b981"
        />
        <AnimatedStatsCard
          title="Total Skills"
          value={totalSkills}
          subtitle={`${verifiedSkills} verified`}
          icon="award"
          index={1}
          accentColor="#3b82f6"
        />
        <AnimatedStatsCard
          title="Interviews"
          value={completedInterviews}
          subtitle={realityCheckCompleted
            ? `${weeklySprintCount} weekly sprint${weeklySprintCount !== 1 ? 's' : ''}`
            : 'Reality check pending'}
          icon="trending-up"
          index={2}
          accentColor="#8b5cf6"
        />
        <AnimatedStatsCard
          title="Applications"
          value={totalApplicationsThisMonth}
          subtitle={activeApplications > 0
            ? `${activeApplications} active`
            : 'This month'}
          icon="briefcase"
          index={3}
          accentColor="#f59e0b"
        />
      </div>

      {/* Main Content Grid */}
      <AnimatedSection delay={0.5}>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          {/* Skills Overview */}
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle>Skills Overview</CardTitle>
              <CardDescription>
                Your claimed skills and verification status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SkillsRadarChart skills={userSkillsData} />
            </CardContent>
          </Card>

          {/* Verification Progress */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Verification Progress</CardTitle>
              <CardDescription>
                Complete interviews to verify your skills
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Overall Progress</span>
                  <span className="font-medium">{verificationProgress}%</span>
                </div>
                <Progress value={verificationProgress} className="h-2" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${verifiedSkills > 0 ? 'bg-green-500/10' : 'bg-primary/10'}`}>
                    <CheckCircle2 className={`h-5 w-5 ${verifiedSkills > 0 ? 'text-green-500' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Skills Verified</p>
                    <p className="text-xs text-muted-foreground">
                      {verifiedSkills} of {totalSkills} skills
                    </p>
                  </div>
                </div>

                {gapsFound > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Gaps Found</p>
                      <p className="text-xs text-muted-foreground">
                        {gapsFound} skill{gapsFound !== 1 ? 's' : ''} need improvement
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/skills">
                        View <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${realityCheckCompleted ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
                    {realityCheckCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Reality Check</p>
                    <p className="text-xs text-muted-foreground">
                      {realityCheckCompleted
                        ? 'Completed'
                        : 'Schedule your first interview'}
                    </p>
                  </div>
                  {!realityCheckCompleted && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/interviews/new">
                        Start <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${weeklySprintCount > 0 ? 'bg-blue-500/10' : 'bg-muted'}`}>
                    <Zap className={`h-5 w-5 ${weeklySprintCount > 0 ? 'text-blue-500' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Weekly Sprints</p>
                    <p className="text-xs text-muted-foreground">
                      {weeklySprintCount > 0
                        ? `${weeklySprintCount} completed`
                        : realityCheckCompleted
                          ? 'Ready to start'
                          : 'Available after Reality Check'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AnimatedSection>

      {/* Interview Performance Section */}
      {completedInterviews > 0 && (
        <AnimatedSection delay={0.6}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
            <div className="lg:col-span-4">
              <InterviewTrendsChart interviews={interviewTrendData} />
            </div>
            <div className="lg:col-span-3">
              <RecentInterviewCard interview={recentInterviewData} />
            </div>
          </div>
        </AnimatedSection>
      )}

      {/* Activity, Market Pulse, Career Insights, and Next Steps */}
      <AnimatedSection delay={0.7}>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Activity Timeline */}
          <ActivityTimeline events={activityEvents} />

          {/* Market Pulse */}
          <MarketPulse skills={marketPulseData} />

          {/* Career Insights */}
          <CareerInsights
            hasCompletedInterview={realityCheckCompleted}
            skillGapsCount={gapsFound}
          />

          {/* Next Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next Steps</CardTitle>
              <CardDescription>
                Recommended actions to boost your profile
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {nextSteps.map((step, index) => (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : index === 0
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                    }`}>
                      {step.completed ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${step.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {step.description}
                      </p>
                    </div>
                    {step.href && !step.completed && (
                      <Button variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0" asChild>
                        <Link href={step.href}>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </AnimatedSection>

      {/* Your Skills */}
      <AnimatedSection delay={0.8}>
        <Card>
          <CardHeader>
            <CardTitle>Your Skills</CardTitle>
            <CardDescription>
              Top skills from your profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {userSkillsData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No skills added yet. Upload your resume or add skills manually.
                </p>
              ) : (
                userSkillsData.slice(0, 15).map((userSkill) => {
                  const hasGap = userSkill.verification_metadata?.gap_identified;
                  const isVerified = userSkill.verification_metadata?.is_verified;

                  return (
                    <Badge
                      key={userSkill.id}
                      variant={hasGap ? 'destructive' : isVerified ? 'default' : 'secondary'}
                      className={hasGap ? 'bg-orange-500 hover:bg-orange-600' : ''}
                    >
                      {userSkill.skill?.name || 'Unknown'}
                      {isVerified && !hasGap && (
                        <CheckCircle2 className="ml-1 h-3 w-3" />
                      )}
                      {hasGap && (
                        <AlertTriangle className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  );
                })
              )}
              {userSkillsData.length > 15 && (
                <Badge variant="outline">+{userSkillsData.length - 15} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </AnimatedSection>
    </div>
  );
}

// Helper function to determine next steps based on user progress
interface NextStep {
  id: string;
  title: string;
  description: string;
  href?: string;
  completed: boolean;
}

function getNextSteps(progress: {
  hasSkills: boolean;
  realityCheckCompleted: boolean;
  verifiedSkills: number;
  totalSkills: number;
  gapsFound: number;
  hasRoadmap: boolean;
}): NextStep[] {
  const steps: NextStep[] = [];

  if (!progress.hasSkills) {
    steps.push({
      id: 'add-skills',
      title: 'Add Your Skills',
      description: 'Upload your resume or add skills manually to get started',
      href: '/onboarding',
      completed: false,
    });
  } else {
    steps.push({
      id: 'add-skills',
      title: 'Skills Added',
      description: `${progress.totalSkills} skills in your profile`,
      completed: true,
    });
  }

  steps.push({
    id: 'reality-check',
    title: 'Complete Reality Check Interview',
    description: progress.realityCheckCompleted
      ? 'Skills verified through interview'
      : 'A 30-minute voice interview to benchmark your skills',
    href: progress.realityCheckCompleted ? undefined : '/interviews/new',
    completed: progress.realityCheckCompleted,
  });

  if (progress.gapsFound > 0) {
    steps.push({
      id: 'address-gaps',
      title: 'Address Skill Gaps',
      description: `${progress.gapsFound} skill${progress.gapsFound !== 1 ? 's' : ''} need improvement`,
      href: '/skills',
      completed: false,
    });
  } else if (progress.realityCheckCompleted) {
    steps.push({
      id: 'review-roadmap',
      title: 'Review Your Roadmap',
      description: 'Personalized learning path based on your goals',
      href: '/roadmap',
      completed: false,
    });
  } else {
    steps.push({
      id: 'review-roadmap',
      title: 'Review Your Roadmap',
      description: 'Available after Reality Check interview',
      completed: false,
    });
  }

  steps.push({
    id: 'explore-jobs',
    title: 'Explore Job Opportunities',
    description: 'AI-matched jobs from Jooble & Adzuna',
    href: '/jobs',
    completed: false,
  });

  return steps.slice(0, 4);
}

// Helper function to get dominant emotion from emotion summary
function getDominantEmotion(emotionSummary?: Record<string, number>): string | undefined {
  if (!emotionSummary) return undefined;
  const entries = Object.entries(emotionSummary);
  if (entries.length === 0) return undefined;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}

// Helper function to build activity events
function buildActivityEvents({
  interviews,
  skills,
}: {
  interviews: Array<{
    id: string;
    type: string;
    status: string;
    completed_at: Date | null;
    overall_score: string | null;
    created_at: Date;
  }>;
  skills: Array<{
    id: string;
    skill?: { name: string } | null;
    verification_metadata?: {
      is_verified?: boolean;
      gap_identified?: boolean;
    } | null;
    created_at: Date;
    updated_at: Date;
  }>;
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Add interview events
  interviews
    .filter(i => i.status === 'completed')
    .slice(0, 3)
    .forEach(interview => {
      events.push({
        id: `interview-${interview.id}`,
        type: 'interview',
        title: interview.type === 'reality_check' ? 'Reality Check Completed' : 'Weekly Sprint Completed',
        description: interview.overall_score
          ? `Scored ${parseFloat(interview.overall_score).toFixed(0)}% overall`
          : 'Interview completed',
        timestamp: interview.completed_at || interview.created_at,
        metadata: {
          score: interview.overall_score ? parseFloat(interview.overall_score) : undefined,
        },
      });
    });

  // Add recent skill verifications
  const verifiedSkills = skills.filter(s => s.verification_metadata?.is_verified);
  if (verifiedSkills.length > 0) {
    events.push({
      id: 'skills-verified',
      type: 'skill_verified',
      title: 'Skills Verified',
      description: `${verifiedSkills.length} skill${verifiedSkills.length !== 1 ? 's' : ''} verified through interviews`,
      timestamp: verifiedSkills[0].updated_at,
      metadata: { count: verifiedSkills.length },
    });
  }

  // Add skill gap events
  const gapSkills = skills.filter(s => s.verification_metadata?.gap_identified);
  if (gapSkills.length > 0) {
    events.push({
      id: 'skill-gaps',
      type: 'skill_gap',
      title: 'Skill Gaps Identified',
      description: `${gapSkills.length} skill${gapSkills.length !== 1 ? 's' : ''} need improvement`,
      timestamp: gapSkills[0].updated_at,
      metadata: { count: gapSkills.length },
    });
  }

  // Add skill added events
  if (skills.length > 0) {
    events.push({
      id: 'skills-added',
      type: 'skill_added',
      title: 'Skills Added',
      description: `${skills.length} skill${skills.length !== 1 ? 's' : ''} in your profile`,
      timestamp: skills[0].created_at,
      metadata: { count: skills.length },
    });
  }

  // Sort by timestamp descending
  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Helper function to calculate streak data from interviews
function calculateStreakData(interviews: Array<{
  completed_at: Date | null;
  status: string;
}>): {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: Date;
  weeklyActivity: boolean[];
} {
  const completedInterviews = interviews
    .filter(i => i.status === 'completed' && i.completed_at)
    .sort((a, b) => b.completed_at!.getTime() - a.completed_at!.getTime());

  if (completedInterviews.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      weeklyActivity: [false, false, false, false, false, false, false],
    };
  }

  const lastActivityDate = completedInterviews[0].completed_at!;

  // Calculate weekly activity (last 7 days)
  const today = new Date();
  const weeklyActivity: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const hasActivity = completedInterviews.some(interview => {
      const interviewDate = interview.completed_at!;
      return interviewDate >= day && interviewDate < nextDay;
    });
    weeklyActivity.push(hasActivity);
  }

  // Calculate current streak (consecutive days with activity, including today)
  let currentStreak = 0;
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  // Check if there's activity today or yesterday to start the streak
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const hasActivityToday = completedInterviews.some(i => i.completed_at! >= todayStart);
  const hasActivityYesterday = completedInterviews.some(i =>
    i.completed_at! >= yesterdayStart && i.completed_at! < todayStart
  );

  if (hasActivityToday || hasActivityYesterday) {
    let checkDate = hasActivityToday ? todayStart : yesterdayStart;

    for (let i = 0; i < 30; i++) {
      const dayStart = new Date(checkDate);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const hasActivity = completedInterviews.some(interview =>
        interview.completed_at! >= dayStart && interview.completed_at! < dayEnd
      );

      if (hasActivity) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak (simplified - based on interview dates)
  let longestStreak = currentStreak;
  // For simplicity, we'll use currentStreak as longestStreak if it's the first run
  // In a real app, you'd store this in the database

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    lastActivityDate,
    weeklyActivity,
  };
}

// Helper function to build weekly goals based on user progress
function buildWeeklyGoals(progress: {
  hasCompletedInterview: boolean;
  hasSkills: boolean;
  realityCheckCompleted: boolean;
  gapsFound: number;
}): Array<{ id: string; title: string; completed: boolean }> {
  const goals: Array<{ id: string; title: string; completed: boolean }> = [];

  goals.push({
    id: '1',
    title: 'Add skills to your profile',
    completed: progress.hasSkills,
  });

  goals.push({
    id: '2',
    title: 'Complete Reality Check interview',
    completed: progress.realityCheckCompleted,
  });

  if (progress.realityCheckCompleted) {
    goals.push({
      id: '3',
      title: 'Review skill gap recommendations',
      completed: progress.gapsFound === 0,
    });

    goals.push({
      id: '4',
      title: 'Apply to matching jobs',
      completed: false,
    });
  } else {
    goals.push({
      id: '3',
      title: 'Set your target roles',
      completed: progress.hasSkills, // Assume set if they have skills
    });

    goals.push({
      id: '4',
      title: 'Explore job opportunities',
      completed: false,
    });
  }

  return goals;
}
