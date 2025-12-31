import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Map, Lock, BookOpen, Target, CheckCircle2 } from 'lucide-react';

export default function RoadmapPage() {
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
