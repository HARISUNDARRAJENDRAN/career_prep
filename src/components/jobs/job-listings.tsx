'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Search,
  Briefcase,
  MapPin,
  Building2,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';

interface Job {
  id: string;
  external_id: string;
  source: string;
  title: string;
  company: string;
  location: string | null;
  salary_range: string | null;
  skills_required: string[] | null;
  scraped_at: string;
  raw_data: {
    description?: string;
    application_url?: string;
    remote_type?: string;
    job_type?: string;
  };
  match_score: number | null;
  matching_skills: string[];
  missing_skills: string[];
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function JobListings() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [withMatching, setWithMatching] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  const limit = 10;

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (currentPage * limit).toString(),
        withMatching: withMatching.toString(),
      });

      if (search) params.set('search', search);
      if (remoteOnly) params.set('remote', 'true');

      const response = await fetch(`/api/jobs/listings?${params}`);
      if (!response.ok) throw new Error('Failed to fetch jobs');

      const data = await response.json();
      setJobs(data.jobs);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, remoteOnly, withMatching]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch !== undefined) {
      fetchJobs();
    }
  }, [debouncedSearch, fetchJobs]);

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 0;

  const getMatchColor = (score: number | null) => {
    if (score === null) return 'bg-muted text-muted-foreground';
    if (score >= 80) return 'bg-green-500 text-white';
    if (score >= 60) return 'bg-yellow-500 text-white';
    if (score >= 40) return 'bg-orange-500 text-white';
    return 'bg-red-500 text-white';
  };

  const getRemoteBadge = (remoteType: string | undefined) => {
    if (!remoteType) return null;
    const variants: Record<string, { label: string; className: string }> = {
      remote: { label: 'Remote', className: 'bg-green-100 text-green-800' },
      hybrid: { label: 'Hybrid', className: 'bg-blue-100 text-blue-800' },
      onsite: { label: 'On-site', className: 'bg-gray-100 text-gray-800' },
    };
    const variant = variants[remoteType] || variants.onsite;
    return (
      <Badge variant="outline" className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs by title, company, or skills..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="remote-only"
                  checked={remoteOnly}
                  onCheckedChange={(checked) => {
                    setRemoteOnly(checked);
                    setCurrentPage(0);
                  }}
                />
                <Label htmlFor="remote-only" className="text-sm">
                  Remote Only
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="with-matching"
                  checked={withMatching}
                  onCheckedChange={(checked) => {
                    setWithMatching(checked);
                    setCurrentPage(0);
                  }}
                />
                <Label htmlFor="with-matching" className="text-sm">
                  Show Match Scores
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {jobs.length} of {pagination.total} jobs
          </span>
          {withMatching && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              Sorted by match score
            </span>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-center text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && jobs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No jobs found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? 'Try adjusting your search criteria'
                : 'Jobs will appear here once the Sentinel Agent scrapes them'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Job Listings */}
      {!loading && !error && jobs.length > 0 && (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{job.title}</CardTitle>
                    <CardDescription className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        {job.company}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {job.location}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRemoteBadge(job.raw_data?.remote_type)}
                    {withMatching && job.match_score !== null && (
                      <Badge className={getMatchColor(job.match_score)}>
                        {job.match_score}% Match
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Salary */}
                {job.salary_range && (
                  <p className="text-sm font-medium text-green-600">
                    {job.salary_range}
                  </p>
                )}

                {/* Skills */}
                {job.skills_required && job.skills_required.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Required Skills
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {job.skills_required.slice(0, 10).map((skill) => {
                        const isMatching = job.matching_skills.includes(skill);
                        return (
                          <Badge
                            key={skill}
                            variant={isMatching ? 'default' : 'outline'}
                            className={
                              isMatching
                                ? 'bg-green-100 text-green-800 border-green-200'
                                : ''
                            }
                          >
                            {isMatching && (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            )}
                            {skill}
                          </Badge>
                        );
                      })}
                      {job.skills_required.length > 10 && (
                        <Badge variant="outline">
                          +{job.skills_required.length - 10} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Missing Skills */}
                {withMatching && job.missing_skills.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-orange-500" />
                      Skills to Develop
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {job.missing_skills.slice(0, 5).map((skill) => (
                        <Badge
                          key={skill}
                          variant="outline"
                          className="bg-orange-50 text-orange-700 border-orange-200"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {job.missing_skills.length > 5 && (
                        <Badge variant="outline">
                          +{job.missing_skills.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {job.source}
                    </Badge>
                    <span>
                      {new Date(job.scraped_at).toLocaleDateString()}
                    </span>
                  </div>
                  {job.raw_data?.application_url && (
                    <Button size="sm" asChild>
                      <a
                        href={job.raw_data.application_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Apply
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={!pagination.hasMore}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
