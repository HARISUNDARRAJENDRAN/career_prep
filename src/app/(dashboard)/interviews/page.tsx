import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Clock, Calendar, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function InterviewsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Interviews
        </h1>
        <p className="text-muted-foreground">
          Voice-to-voice interviews powered by Hume AI to verify and grow your skills.
        </p>
      </div>

      {/* Interview Types */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Reality Check Interview */}
        <Card className="relative overflow-hidden">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-primary/10" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="w-fit">
                Required
              </Badge>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="mt-2">Reality Check Interview</CardTitle>
            <CardDescription>
              A comprehensive 1-hour interview to establish your baseline skill levels.
              This is the foundation for your personalized roadmap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Duration: ~60 minutes</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span>Voice-to-voice with AI interviewer</span>
              </div>
              <Button className="w-full" size="lg">
                <Sparkles className="mr-2 h-4 w-4" />
                Schedule Reality Check
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Coming soon - Hume AI integration in progress
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Sprint Interview */}
        <Card className="relative overflow-hidden opacity-60">
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
              Short 15-minute interviews to verify your learning progress and
              update your skill verification status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Duration: ~15 minutes</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>Focuses on recently learned skills</span>
              </div>
              <Button className="w-full" size="lg" variant="outline" disabled>
                <AlertCircle className="mr-2 h-4 w-4" />
                Complete Reality Check First
              </Button>
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
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Mic className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No interviews yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Complete your Reality Check Interview to start building your
              verified skill profile.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
