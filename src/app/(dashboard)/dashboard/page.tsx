import { currentUser } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { users, userProfiles, userSkills, interviews, jobApplications } from '@/drizzle/schema';
import { eq, count, and, gte, desc } from 'drizzle-orm';
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
  Target,
  TrendingUp,
  Award,
  Briefcase,
  CheckCircle2,
  Clock,
  Zap,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { SkillsRadarChart } from '@/components/dashboard/skills-radar-chart';

export default async function DashboardPage() {
  const user = await currentUser();

  // Fetch user profile and skills
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, user!.id),
  });

  const skills = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, user!.id),
    with: {
      skill: true,
    },
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

  // Calculate stats
  const totalSkills = skills.length;
  const verifiedSkills = skills.filter(
    (s) => s.verification_metadata?.is_verified
  ).length;
  const gapsFound = skills.filter(
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
  const latestInterview = userInterviews[0];

  // Job application stats
  const totalApplicationsThisMonth = monthlyApplications.length;
  const activeApplications = monthlyApplications.filter(
    a => a.status === 'applied' || a.status === 'interviewing'
  ).length;

  // Determine next steps based on user progress
  const nextSteps = getNextSteps({
    hasSkills: totalSkills > 0,
    realityCheckCompleted,
    verifiedSkills,
    totalSkills,
    gapsFound,
    hasRoadmap: false, // TODO: Check if user has roadmap
  });

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Welcome back, {user?.firstName || 'there'}!
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your career preparation journey.
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Target Roles</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{targetRoles.length}</div>
            <p className="text-xs text-muted-foreground">
              {targetRoles.slice(0, 2).join(', ') || 'Not set'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Skills</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSkills}</div>
            <p className="text-xs text-muted-foreground">
              {verifiedSkills} verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interviews</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedInterviews}</div>
            <p className="text-xs text-muted-foreground">
              {realityCheckCompleted
                ? `${weeklySprintCount} weekly sprint${weeklySprintCount !== 1 ? 's' : ''}`
                : 'Reality check pending'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalApplicationsThisMonth}</div>
            <p className="text-xs text-muted-foreground">
              {activeApplications > 0
                ? `${activeApplications} active`
                : 'This month'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
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
            <SkillsRadarChart skills={skills} />
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

      {/* Recent Activity / Next Steps */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
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
                  <div className="flex-1">
                    <p className={`font-medium ${step.completed ? 'line-through text-muted-foreground' : ''}`}>
                      {step.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {step.href && !step.completed && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={step.href}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Skills</CardTitle>
            <CardDescription>
              Top skills from your profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No skills added yet. Upload your resume or add skills manually.
                </p>
              ) : (
                skills.slice(0, 12).map((userSkill) => {
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
              {skills.length > 12 && (
                <Badge variant="outline">+{skills.length - 12} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
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

  // Step 1: Add skills if none exist
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

  // Step 2: Complete Reality Check
  steps.push({
    id: 'reality-check',
    title: 'Complete Reality Check Interview',
    description: progress.realityCheckCompleted
      ? 'Skills verified through interview'
      : 'A 30-minute voice interview to benchmark your skills',
    href: progress.realityCheckCompleted ? undefined : '/interviews/new',
    completed: progress.realityCheckCompleted,
  });

  // Step 3: Address skill gaps (if any found)
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

  // Step 4: Explore jobs
  steps.push({
    id: 'explore-jobs',
    title: 'Explore Job Opportunities',
    description: 'AI-matched jobs from Jooble & Adzuna',
    href: '/jobs',
    completed: false,
  });

  return steps.slice(0, 4); // Max 4 steps
}
