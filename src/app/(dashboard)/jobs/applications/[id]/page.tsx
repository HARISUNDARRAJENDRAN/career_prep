import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { jobApplications } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
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
  ArrowLeft,
  Briefcase,
  MapPin,
  Calendar,
  ExternalLink,
  FileText,
  CheckCircle2,
  XCircle,
  Ghost,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

// Status badge config
const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }
> = {
  draft: { label: 'Draft', variant: 'outline', icon: <FileText className="h-4 w-4" /> },
  applied: { label: 'Applied', variant: 'default', icon: <CheckCircle2 className="h-4 w-4" /> },
  interviewing: { label: 'Interviewing', variant: 'secondary', icon: <Briefcase className="h-4 w-4" /> },
  offered: { label: 'Offered', variant: 'default', icon: <CheckCircle2 className="h-4 w-4" /> },
  rejected: { label: 'Rejected', variant: 'destructive', icon: <XCircle className="h-4 w-4" /> },
  ghosted: { label: 'Ghosted', variant: 'outline', icon: <Ghost className="h-4 w-4" /> },
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    return null;
  }

  // Fetch application with job listing
  const application = await db.query.jobApplications.findFirst({
    where: and(
      eq(jobApplications.id, id),
      eq(jobApplications.user_id, userId)
    ),
    with: {
      jobListing: true,
      document: true,
    },
  });

  if (!application) {
    notFound();
  }

  const status = statusConfig[application.status] || statusConfig.draft;
  const matchScore = (application.raw_data as { match_score?: number })?.match_score;
  const agentReasoning = (application.raw_data as { agent_reasoning?: string })?.agent_reasoning;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/jobs/applications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{application.role}</h1>
            <Badge variant={status.variant} className="gap-1">
              {status.icon}
              {status.label}
            </Badge>
            {matchScore && (
              <Badge variant="outline">{matchScore}% match</Badge>
            )}
          </div>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Briefcase className="h-4 w-4" />
            {application.company}
            {application.location && (
              <>
                <MapPin className="h-4 w-4 ml-2" />
                {application.location}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Created:</span>
              <span>{new Date(application.created_at).toLocaleDateString()}</span>
            </div>
            {application.applied_at && (
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Applied:</span>
                <span>{new Date(application.applied_at).toLocaleDateString()}</span>
              </div>
            )}
            {application.last_activity_at && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last activity:</span>
                <span>{new Date(application.last_activity_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agent Reasoning (if auto-applied) */}
      {agentReasoning && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Agent Notes</CardTitle>
            <CardDescription>
              Key points the Action Agent used for your cover letter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {agentReasoning}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Job Details */}
      {application.jobListing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {application.jobListing.raw_data && (
              <>
                {(application.jobListing.raw_data as { description?: string }).description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-10">
                      {(application.jobListing.raw_data as { description: string }).description}
                    </p>
                  </div>
                )}
                {(application.jobListing.raw_data as { application_url?: string }).application_url && (
                  <Button variant="outline" asChild>
                    <a
                      href={(application.jobListing.raw_data as { application_url: string }).application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Original Posting
                    </a>
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {application.status === 'draft' && (
          <Button>Submit Application</Button>
        )}
        <Button variant="outline" asChild>
          <Link href="/jobs/applications">Back to Applications</Link>
        </Button>
      </div>
    </div>
  );
}
