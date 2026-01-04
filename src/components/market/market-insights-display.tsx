'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  BarChart3,
  Building2,
  Globe,
  Loader2,
  RefreshCw,
  Clock,
  Github,
  Star,
  Zap,
  ArrowUpRight,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GitHubVelocityData {
  trending_repos: Array<{
    name: string;
    full_name: string;
    description: string | null;
    url: string;
    stars: number;
    language: string | null;
  }>;
  language_trends: Array<{
    language: string;
    repos_count: number;
    total_stars: number;
  }>;
  tech_velocity: Array<{
    name: string;
    category: string;
    velocity_score: number;
    trend: string;
  }>;
  tech_correlations: Array<{
    skill: string;
    job_demand: number;
    github_velocity: number;
    correlation: string;
    recommendation: string;
  }>;
  last_updated: string | null;
}

interface MarketInsightsData {
  summary: {
    total_jobs: number;
    remote_jobs: number;
    remote_percentage: number;
    last_updated: string | null;
    sources: Record<string, number>;
  };
  trending_skills: string[];
  skill_demand: Array<{ name: string; count: number }>;
  trending_roles: string[];
  salary_ranges: Record<string, { min: number; max: number; avg: number }>;
  top_companies: Array<{ name: string; jobs: number }>;
  market_shifts: Array<{ type: string; description: string; impact: string }>;
  github_velocity: GitHubVelocityData | null;
}

export function MarketInsightsDisplay() {
  const [data, setData] = useState<MarketInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/market/insights');
      if (!response.ok) throw new Error('Failed to fetch market insights');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-6 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { summary, trending_skills, skill_demand, top_companies, github_velocity } = data;

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'rising':
        return 'text-green-500';
      case 'declining':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const getCorrelationBadge = (correlation: string) => {
    switch (correlation) {
      case 'high':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.total_jobs.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Active job listings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remote Jobs</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.remote_jobs.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.remote_percentage}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sources</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {Object.entries(summary.sources).map(([source, count]) => (
                <Badge key={source} variant="secondary">
                  {source}: {count}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Jobs by platform
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {summary.last_updated
                ? new Date(summary.last_updated).toLocaleDateString()
                : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.last_updated
                ? new Date(summary.last_updated).toLocaleTimeString()
                : 'Run the Sentinel Agent'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Top Skills in Demand */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <CardTitle>Skills in Demand</CardTitle>
            </div>
            <CardDescription>
              Most requested skills in current job listings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {skill_demand.length > 0 ? (
              <div className="space-y-3">
                {skill_demand.slice(0, 10).map((skill, index) => {
                  const maxCount = skill_demand[0]?.count || 1;
                  const percentage = (skill.count / maxCount) * 100;

                  return (
                    <div key={skill.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                            {index + 1}
                          </span>
                          <span className="font-medium">{skill.name}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {skill.count} jobs
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No skill data available yet. Run the Sentinel Agent to scrape jobs.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Companies Hiring */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <CardTitle>Top Companies</CardTitle>
            </div>
            <CardDescription>Companies with most openings</CardDescription>
          </CardHeader>
          <CardContent>
            {top_companies.length > 0 ? (
              <div className="space-y-3">
                {top_companies.map((company, index) => (
                  <div
                    key={company.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium truncate max-w-[150px]">
                        {company.name}
                      </span>
                    </div>
                    <Badge variant="secondary">{company.jobs} jobs</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No company data yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* GitHub Velocity Section */}
      {github_velocity && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            <h2 className="text-xl font-semibold">GitHub Velocity</h2>
            {github_velocity.last_updated && (
              <span className="text-sm text-muted-foreground ml-auto">
                Updated {new Date(github_velocity.last_updated).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Tech Velocity */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <CardTitle>Technology Velocity</CardTitle>
                </div>
                <CardDescription>
                  Fastest growing technologies on GitHub
                </CardDescription>
              </CardHeader>
              <CardContent>
                {github_velocity.tech_velocity.length > 0 ? (
                  <div className="space-y-3">
                    {github_velocity.tech_velocity.slice(0, 8).map((tech) => (
                      <div key={tech.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">{tech.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {tech.category}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={getTrendColor(tech.trend)}>
                              {tech.trend === 'rising' && <ArrowUpRight className="h-4 w-4" />}
                              {tech.trend === 'stable' && <ArrowRight className="h-4 w-4" />}
                            </span>
                            <span className="text-muted-foreground">
                              {tech.velocity_score}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              tech.trend === 'rising'
                                ? 'bg-green-500'
                                : tech.trend === 'declining'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                            }`}
                            style={{ width: `${tech.velocity_score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No GitHub velocity data yet. Add GITHUB_TOKEN to enable.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Trending Repos */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <CardTitle>Trending Repos</CardTitle>
                </div>
                <CardDescription>Hot projects this week</CardDescription>
              </CardHeader>
              <CardContent>
                {github_velocity.trending_repos.length > 0 ? (
                  <div className="space-y-3">
                    {github_velocity.trending_repos.slice(0, 5).map((repo) => (
                      <a
                        key={repo.full_name}
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate max-w-[180px]">
                            {repo.name}
                          </span>
                          <div className="flex items-center gap-1 text-yellow-500">
                            <Star className="h-3 w-3" />
                            <span className="text-xs">
                              {repo.stars.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {repo.language && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {repo.language}
                          </Badge>
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No trending repos data.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tech Correlations - Skills to Learn */}
          {github_velocity.tech_correlations.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  <CardTitle>Skills to Watch</CardTitle>
                </div>
                <CardDescription>
                  Correlating GitHub trends with job market demand
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {github_velocity.tech_correlations.slice(0, 6).map((item) => (
                    <div
                      key={item.skill}
                      className="p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium capitalize">{item.skill}</span>
                        <Badge
                          variant="outline"
                          className={getCorrelationBadge(item.correlation)}
                        >
                          {item.correlation} correlation
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        <span>GitHub: {item.github_velocity}%</span>
                        <span>Jobs: {item.job_demand}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Trending Skills Tags */}
      {trending_skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Trending Skills</CardTitle>
            <CardDescription>
              Popular skills across all job listings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {trending_skills.map((skill) => (
                <Badge key={skill} variant="outline" className="text-sm">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
