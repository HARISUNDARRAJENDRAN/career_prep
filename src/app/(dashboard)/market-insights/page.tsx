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
  TrendingDown,
  Minus,
  BarChart3,
  Globe,
  DollarSign,
  Lock,
} from 'lucide-react';

// Mock data for market insights preview
const trendingSkills = [
  { name: 'AI/ML', trend: 'up', change: '+32%' },
  { name: 'Rust', trend: 'up', change: '+28%' },
  { name: 'TypeScript', trend: 'up', change: '+15%' },
  { name: 'Next.js', trend: 'up', change: '+22%' },
  { name: 'Kubernetes', trend: 'stable', change: '+2%' },
];

const topLocations = [
  { city: 'San Francisco', jobs: 12500 },
  { city: 'New York', jobs: 9800 },
  { city: 'Seattle', jobs: 7200 },
  { city: 'Austin', jobs: 5600 },
  { city: 'Remote', jobs: 18000 },
];

export default function MarketInsightsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Market Insights
        </h1>
        <p className="text-muted-foreground">
          Real-time job market trends powered by the Sentinel Agent.
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="mt-4">Live Market Data Coming Soon</CardTitle>
          <CardDescription className="max-w-md mx-auto">
            The Sentinel Agent will scrape Jooble and Adzuna to provide real-time
            market insights. Below is a preview of what you&apos;ll see.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Preview Content */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Trending Skills */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <CardTitle>Trending Skills</CardTitle>
            </div>
            <CardDescription>
              Most in-demand skills based on job postings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trendingSkills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {skill.trend === 'up' && (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    )}
                    {skill.trend === 'down' && (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    {skill.trend === 'stable' && (
                      <Minus className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{skill.name}</span>
                  </div>
                  <Badge
                    variant={skill.trend === 'up' ? 'default' : 'secondary'}
                    className={
                      skill.trend === 'up' ? 'bg-green-500 hover:bg-green-600' : ''
                    }
                  >
                    {skill.change}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Locations */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <CardTitle>Top Locations</CardTitle>
            </div>
            <CardDescription>Where the jobs are</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topLocations.map((location, index) => (
                <div
                  key={location.city}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="text-sm">{location.city}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {location.jobs.toLocaleString()} jobs
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Job Listings
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Scraped from Jooble & Adzuna
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Salary</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$--</div>
            <p className="text-xs text-muted-foreground">
              For your target roles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Match Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--%</div>
            <p className="text-xs text-muted-foreground">
              Based on verified skills
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
