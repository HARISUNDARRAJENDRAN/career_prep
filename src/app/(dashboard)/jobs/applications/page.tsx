import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobApplications, userProfiles } from '@/drizzle/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  Ghost,
  FileText,
  Settings,
  Plus,
} from 'lucide-react';
import Link from 'next/link';

// Status badge colors and icons
const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }
> = {
  draft: { label: 'Draft', variant: 'outline', icon: <FileText className="h-3 w-3" /> },
  applied: { label: 'Applied', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
  interviewing: { label: 'Interviewing', variant: 'secondary', icon: <Briefcase className="h-3 w-3" /> },
  offered: { label: 'Offered', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rejected', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
  ghosted: { label: 'Ghosted', variant: 'outline', icon: <Ghost className="h-3 w-3" /> },
};

export default async function ApplicationsPage() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // Fetch applications
  const applications = await db.query.jobApplications.findMany({
    where: eq(jobApplications.user_id, userId),
    orderBy: [desc(jobApplications.created_at)],
    with: {
      jobListing: true,
    },
  });

  // Fetch user profile for auto-apply settings
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, userId),
  });

  // Calculate stats
  const totalApplications = applications.length;
  const appliedCount = applications.filter((a) => a.status === 'applied').length;
  const interviewingCount = applications.filter((a) => a.status === 'interviewing').length;
  const draftCount = applications.filter((a) => a.status === 'draft').length;

  // Today's applications
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayApplications = applications.filter(
    (a) => a.applied_at && new Date(a.applied_at) >= todayStart
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            My Applications
          </h1>
          <p className="text-muted-foreground">
            Track and manage your job applications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/jobs/settings">
              <Settings className="mr-2 h-4 w-4" />
              Auto-Apply Settings
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/jobs">
              <Plus className="mr-2 h-4 w-4" />
              Find Jobs
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalApplications}</div>
            <p className="text-xs text-muted-foreground">
              {draftCount} drafts pending review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applied Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayApplications}</div>
            <p className="text-xs text-muted-foreground">
              of {profile?.auto_apply_daily_limit || 5} daily limit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interviewing</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{interviewingCount}</div>
            <p className="text-xs text-muted-foreground">active interviews</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Apply</CardTitle>
            {profile?.auto_apply_enabled ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profile?.auto_apply_enabled ? 'Active' : 'Disabled'}
            </div>
            <p className="text-xs text-muted-foreground">
              {profile?.auto_apply_threshold || 75}% match threshold
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Applications List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Applications</CardTitle>
          <CardDescription>
            Your job applications sorted by most recent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No applications yet</h3>
              <p className="text-muted-foreground mb-4">
                Start applying to jobs to track them here
              </p>
              <Button asChild>
                <Link href="/jobs">Browse Jobs</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((application) => {
                const status = statusConfig[application.status] || statusConfig.draft;
                const matchScore = (application.raw_data as { match_score?: number })?.match_score;

                return (
                  <div
                    key={application.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{application.role}</h3>
                        <Badge variant={status.variant} className="gap-1">
                          {status.icon}
                          {status.label}
                        </Badge>
                        {matchScore && (
                          <Badge variant="outline" className="text-xs">
                            {matchScore}% match
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {application.company}
                        {application.location && ` • ${application.location}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {application.applied_at
                          ? `Applied ${new Date(application.applied_at).toLocaleDateString()}`
                          : `Created ${new Date(application.created_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {application.jobListing?.raw_data && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={(application.jobListing.raw_data as { application_url?: string }).application_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Job
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/jobs/applications/${application.id}`}>
                          Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
