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
  Briefcase,
  Search,
  Zap,
  FileText,
  ExternalLink,
  Filter,
  Lock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function JobsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Job Hunt
        </h1>
        <p className="text-muted-foreground">
          AI-powered job matching and autonomous application system.
        </p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs by title, company, or skills..."
                className="pl-9"
                disabled
              />
            </div>
            <Button variant="outline" disabled>
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            <Button disabled>
              <Zap className="mr-2 h-4 w-4" />
              Auto-Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coming Soon Card */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="mt-4">Job Matching Coming Soon</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            The Sentinel Agent will scrape job listings from Jooble and Adzuna,
            matching them to your verified skills. The Action Agent will help
            you auto-apply with personalized cover letters.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button variant="outline" asChild>
            <a href="/interviews">Complete Interview First</a>
          </Button>
        </CardContent>
      </Card>

      {/* Features Preview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Smart Matching</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Jobs matched to your verified skills using semantic search and RAG.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Auto-Apply</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              One-click applications with AI-generated cover letters tailored to each job.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Application Tracking</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Track all applications, responses, and rejection feedback in one place.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Applications Table (Empty State) */}
      <Card>
        <CardHeader>
          <CardTitle>Your Applications</CardTitle>
          <CardDescription>
            Track and manage your job applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No applications yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Start applying to jobs to see your application history here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
