import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { roadmaps, roadmapModules } from '@/drizzle/schema';
import { eq, asc } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Lock,
  BookOpen,
  Target,
  CheckCircle2,
  Clock,
  Trophy,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export default async function RoadmapPage() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // Fetch user's active roadmap with modules
  const userRoadmap = await db.query.roadmaps.findFirst({
    where: eq(roadmaps.user_id, userId),
    with: {
      modules: {
        orderBy: [asc(roadmapModules.order_index)],
      },
    },
  });

  // If no roadmap exists, show the "coming soon" state
  if (!userRoadmap) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            My Roadmap
          </h1>
          <p className="text-muted-foreground">
            Your personalized learning path to career success.
          </p>
        </div>

        {/* Coming Soon Card */}
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="mt-4">Roadmap Unlocks After Interview</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Complete your Reality Check Interview to unlock your personalized
              learning roadmap. The Architect Agent will create a customized path
              based on your verified skills and career goals.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <a href="/interviews">Schedule Interview</a>
            </Button>
          </CardContent>
        </Card>

        {/* Preview of what's coming */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Learning Modules</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Curated courses and resources tailored to fill your skill gaps.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Milestone Tracking</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Clear milestones and progress indicators to keep you on track.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Skill Verification</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Weekly sprints to verify your learning progress through interviews.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalModules = userRoadmap.modules.length;
  const completedModules = userRoadmap.modules.filter(
    (m) => m.status === 'completed'
  ).length;
  const totalHours = userRoadmap.modules.reduce(
    (sum, m) => sum + (m.estimated_hours || 0),
    0
  );
  const milestones = userRoadmap.modules.filter((m) => m.is_milestone);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {userRoadmap.title}
        </h1>
        <p className="text-muted-foreground">{userRoadmap.description}</p>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Completion</span>
              <span className="font-medium">
                {completedModules} / {totalModules} modules
              </span>
            </div>
            <Progress
              value={
                totalModules > 0 ? (completedModules / totalModules) * 100 : 0
              }
              className="h-2"
            />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{totalModules}</p>
                <p className="text-xs text-muted-foreground">Modules</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{totalHours}h</p>
                <p className="text-xs text-muted-foreground">Est. Time</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{milestones.length}</p>
                <p className="text-xs text-muted-foreground">Milestones</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Learning Modules */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Learning Path</h2>
        <div className="space-y-3">
          {userRoadmap.modules.map((module, index) => (
            <Card
              key={module.id}
              className={
                module.status === 'completed'
                  ? 'border-green-500/50 bg-green-500/5'
                  : module.status === 'in_progress'
                    ? 'border-primary/50 bg-primary/5'
                    : ''
              }
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Module Number / Status */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    module.status === 'completed'
                      ? 'bg-green-500 text-white'
                      : module.status === 'in_progress'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {module.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>

                {/* Module Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{module.title}</h3>
                    {module.is_milestone && (
                      <Trophy className="h-4 w-4 text-yellow-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {module.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {module.estimated_hours}h
                    </span>
                    <span
                      className={`capitalize ${
                        module.status === 'completed'
                          ? 'text-green-600'
                          : module.status === 'in_progress'
                            ? 'text-primary'
                            : ''
                      }`}
                    >
                      {module.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <Button
                  variant={module.status === 'available' ? 'outline' : 'ghost'}
                  size="sm"
                  asChild
                >
                  <Link href={`/roadmap/${module.id}`}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
