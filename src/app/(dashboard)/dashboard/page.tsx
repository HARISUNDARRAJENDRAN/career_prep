import { currentUser } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { users, userProfiles, userSkills } from '@/drizzle/schema';
import { eq, count } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target,
  TrendingUp,
  Award,
  Briefcase,
  CheckCircle2,
  Clock,
  Zap,
} from 'lucide-react';
import { SkillsRadarChart } from '@/components/dashboard/skills-radar-chart';
import { ProgressChart } from '@/components/dashboard/progress-chart';

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

  // Calculate stats
  const totalSkills = skills.length;
  const verifiedSkills = skills.filter(
    (s) => s.verification_metadata?.is_verified
  ).length;
  const targetRoles = profile?.target_roles || [];
  const verificationProgress =
    totalSkills > 0 ? Math.round((verifiedSkills / totalSkills) * 100) : 0;

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
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Reality check pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">This month</p>
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
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Skills Verified</p>
                  <p className="text-xs text-muted-foreground">
                    {verifiedSkills} of {totalSkills} skills
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Reality Check</p>
                  <p className="text-xs text-muted-foreground">
                    Schedule your first interview
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Zap className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Weekly Sprint</p>
                  <p className="text-xs text-muted-foreground">
                    Available after Reality Check
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
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  1
                </div>
                <div>
                  <p className="font-medium">Complete Reality Check Interview</p>
                  <p className="text-sm text-muted-foreground">
                    A 1-hour voice interview to benchmark your skills
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  2
                </div>
                <div>
                  <p className="font-medium">Review Your Roadmap</p>
                  <p className="text-sm text-muted-foreground">
                    Personalized learning path based on your goals
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  3
                </div>
                <div>
                  <p className="font-medium">Explore Job Opportunities</p>
                  <p className="text-sm text-muted-foreground">
                    AI-matched jobs from Jooble & Adzuna
                  </p>
                </div>
              </div>
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
                skills.slice(0, 12).map((userSkill) => (
                  <Badge
                    key={userSkill.id}
                    variant={
                      userSkill.verification_metadata?.is_verified
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {userSkill.skill?.name || 'Unknown'}
                    {userSkill.verification_metadata?.is_verified && (
                      <CheckCircle2 className="ml-1 h-3 w-3" />
                    )}
                  </Badge>
                ))
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
