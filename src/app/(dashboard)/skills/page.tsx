import { currentUser } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { userSkills } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Award,
  CheckCircle2,
  Clock,
  Plus,
  Filter,
  Search,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

const proficiencyColors: Record<string, string> = {
  learning: 'bg-blue-500',
  practicing: 'bg-yellow-500',
  proficient: 'bg-green-500',
  expert: 'bg-purple-500',
};

const proficiencyLevels: Record<string, number> = {
  learning: 25,
  practicing: 50,
  proficient: 75,
  expert: 100,
};

export default async function SkillsPage() {
  const user = await currentUser();

  const skills = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, user!.id),
    with: {
      skill: true,
    },
  });

  // Group skills by category
  const skillsByCategory = skills.reduce(
    (acc, skill) => {
      const category = skill.skill?.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    },
    {} as Record<string, typeof skills>
  );

  const totalSkills = skills.length;
  const verifiedSkills = skills.filter(
    (s) => s.verification_metadata?.is_verified
  ).length;
  const gapsFound = skills.filter(
    (s) => s.verification_metadata?.gap_identified
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Skills
          </h1>
          <p className="text-muted-foreground">
            Manage and verify your professional skills.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/interviews/new">
              <TrendingUp className="mr-2 h-4 w-4" />
              Verify Skills
            </Link>
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Skill
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Skills</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSkills}</div>
            <p className="text-xs text-muted-foreground">
              From resume and manual entry
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{verifiedSkills}</div>
            <p className="text-xs text-muted-foreground">
              Confirmed through interviews
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gaps Found</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gapsFound}</div>
            <p className="text-xs text-muted-foreground">
              Need improvement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSkills - verifiedSkills}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting verification
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search skills..." className="pl-9" />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter by Category
        </Button>
      </div>

      {/* Skills by Category */}
      {Object.keys(skillsByCategory).length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Award className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">No skills yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Upload your resume during onboarding or add skills manually to
                start building your profile.
              </p>
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Skill
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-lg">{category}</CardTitle>
                <CardDescription>
                  {categorySkills.length} skill
                  {categorySkills.length !== 1 ? 's' : ''} in this category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categorySkills.map((userSkill) => {
                    const metadata = userSkill.verification_metadata;
                    const hasGap = metadata?.gap_identified;
                    const isVerified = metadata?.is_verified;
                    const verifiedLevel = metadata?.verified_level as string | undefined;
                    const recommendations = (metadata as { recommendations?: string[] })?.recommendations;

                    return (
                      <div
                        key={userSkill.id}
                        className={`rounded-lg border p-4 ${hasGap ? 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium">
                                {userSkill.skill?.name || 'Unknown Skill'}
                              </h4>
                              {isVerified ? (
                                hasGap ? (
                                  <Badge
                                    variant="default"
                                    className="bg-orange-500 hover:bg-orange-600"
                                  >
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    Gap Found
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="default"
                                    className="bg-green-500 hover:bg-green-600"
                                  >
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    Verified
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="secondary">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Pending
                                </Badge>
                              )}
                            </div>

                            {/* Show claimed vs verified level if there's a gap */}
                            {hasGap && verifiedLevel && (
                              <div className="mt-2 flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Claimed:</span>
                                <span className="capitalize font-medium">{userSkill.proficiency_level}</span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Verified:</span>
                                <span className="capitalize font-medium text-orange-600">{verifiedLevel}</span>
                              </div>
                            )}

                            {/* Progress bar */}
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-sm text-muted-foreground capitalize">
                                {isVerified ? (verifiedLevel || userSkill.proficiency_level) : userSkill.proficiency_level}
                              </span>
                              <Progress
                                value={
                                  proficiencyLevels[isVerified && verifiedLevel ? verifiedLevel : userSkill.proficiency_level] || 50
                                }
                                className={`h-2 w-24 ${hasGap ? '[&>div]:bg-orange-500' : ''}`}
                              />
                            </div>

                            {/* Recommendations */}
                            {recommendations && recommendations.length > 0 && (
                              <div className="mt-3 p-2 bg-background rounded border">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations:</p>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                  {recommendations.slice(0, 3).map((rec: string, i: number) => (
                                    <li key={i} className="flex items-start gap-1">
                                      <span className="text-orange-500">•</span>
                                      {rec}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {metadata?.source || 'manual'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
