# Strategic Directives Integration Plan

> **Document Version:** 1.0  
> **Created:** January 7, 2026  
> **Priority:** P1 (High - Differentiator Feature)  
> **Estimated Effort:** 6-8 hours  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Integration Tasks](#4-integration-tasks)
5. [Code Changes Required](#5-code-changes-required)
6. [Directive Scenarios](#6-directive-scenarios)
7. [UI/UX Design](#7-uiux-design)
8. [Testing Strategy](#8-testing-strategy)
9. [Demo Scenario](#9-demo-scenario)

---

## 1. Executive Summary

### Problem Statement
Strategic Directives exist as a data layer but are **not driving agent behavior**:
- Strategist Agent can issue directives ✅
- Directive templates exist ✅
- **Gap:** Action Agent doesn't check directives before applying
- **Gap:** Resume Agent doesn't respond to `resume_rewrite` directives
- **Gap:** No UI showing "Strategist blocked your applications because..."
- **Gap:** No demo where Strategist actually overrides Action Agent

### Goal
Create a **visible command chain** where:
1. Strategist analyzes user situation
2. Strategist issues directive (e.g., "Pause applications - focus on skill building")
3. Action Agent **reads and obeys** the directive
4. User sees clear UI showing why automation was paused
5. User can dismiss/complete directives to resume normal operation

### Why This Wins Hackathons
This demonstrates **true multi-agent coordination** - agents that:
- Communicate with each other
- Make decisions that affect other agents
- Show reasoning ("I paused your applications because...")
- Allow human oversight

---

## 2. Current State Analysis

### What's Built

| Component | Location | Status |
|-----------|----------|--------|
| `strategicDirectives` table | `src/drizzle/schema/strategic-directives.ts` | ✅ Complete |
| `directiveExecutionLog` table | `src/drizzle/schema/strategic-directives.ts` | ✅ Complete |
| `issueDirective()` function | `src/services/strategic-directives/index.ts:68` | ✅ Complete |
| `getActiveDirectives()` function | `src/services/strategic-directives/index.ts:147` | ✅ Complete |
| Directive templates (6 types) | `src/services/strategic-directives/index.ts:350-550` | ✅ Complete |
| Weekly Sprint checks blocking directives | `src/trigger/jobs/weekly-career-sprint.ts:403-440` | ✅ Partial |
| DirectivesList UI component | `src/components/agent-control/directives-list.tsx` | ✅ Exists |
| SSE `directive_issued` event | `src/services/realtime/index.ts` | ✅ Exists |

### What's Missing

| Component | Description | Priority |
|-----------|-------------|----------|
| **Auto-Applier Directive Check** | Action Agent doesn't check directives before applying | Critical |
| **Directive Effect Visualization** | No UI showing "blocked because of directive X" | High |
| **Directive Completion Flow** | User can't mark directives as completed | High |
| **Strategist Auto-Issue Logic** | Strategist doesn't proactively issue directives | Medium |
| **Directive Action Buttons** | No "Acknowledge" / "Dismiss" buttons | Medium |
| **Directive Impact Metrics** | No tracking of directive effectiveness | Low |

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STRATEGIC DIRECTIVES FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     STRATEGIST AGENT                                 │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐   │   │
│  │  │ Analyze Data  │─►│ Detect Issue  │─►│ Issue Directive       │   │   │
│  │  │ (rejections,  │  │ (burnout,     │  │ (pause_applications,  │   │   │
│  │  │  ghosting,    │  │  skill gap,   │  │  resume_rewrite,      │   │   │
│  │  │  velocity)    │  │  low response)│  │  skill_priority)      │   │   │
│  │  └───────────────┘  └───────────────┘  └───────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    strategic_directives TABLE                        │   │
│  │  { id, user_id, type, status, target_agent, action_required, ... }  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                    ┌───────────────┴───────────────┐                        │
│                    ▼                               ▼                        │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐        │
│  │       ACTION AGENT          │   │        RESUME AGENT          │        │
│  │  ┌─────────────────────┐   │   │  ┌─────────────────────┐    │        │
│  │  │ checkDirectives()   │   │   │  │ checkDirectives()   │    │        │
│  │  │ BEFORE every apply  │   │   │  │ BEFORE every update │    │        │
│  │  └─────────────────────┘   │   │  └─────────────────────┘    │        │
│  │            │               │   │            │                 │        │
│  │            ▼               │   │            ▼                 │        │
│  │  ┌─────────────────────┐   │   │  ┌─────────────────────┐    │        │
│  │  │ IF pause_apps:      │   │   │  │ IF resume_rewrite:  │    │        │
│  │  │   SKIP application  │   │   │  │   PRIORITIZE skills │    │        │
│  │  │   NOTIFY user       │   │   │  │   UPDATE resume     │    │        │
│  │  └─────────────────────┘   │   │  └─────────────────────┘    │        │
│  └─────────────────────────────┘   └─────────────────────────────┘        │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         USER INTERFACE                               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  🚨 DIRECTIVE ACTIVE                                         │   │   │
│  │  │  "Applications Paused: Focus on System Design skills"        │   │   │
│  │  │                                                              │   │   │
│  │  │  Reason: 3 consecutive rejections cited "system design"      │   │   │
│  │  │  Required: Complete 2 practice sessions                      │   │   │
│  │  │                                                              │   │   │
│  │  │  [Mark Complete]  [Dismiss]  [View Details]                  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Integration Tasks

### Task 4.1: Add Directive Check to Auto-Applier
**File:** `src/trigger/jobs/auto-applier.ts`  
**Effort:** 1.5 hours

Insert directive check **before** Step 8 (Generate Cover Letter):

```typescript
// After Step 7 (check already applied), BEFORE Step 8 (generate cover letter)

// =========================================================================
// Step 7.5: Check for blocking strategic directives
// =========================================================================
import { getActiveDirectives } from '@/services/strategic-directives';
import { broadcastToUser } from '@/services/realtime';

const blockingDirectiveTypes = ['pause_applications', 'focus_shift', 'skill_priority'];

const blockingDirectives = await getActiveDirectives(user_id, {
  target_agent: 'action',
});

// Filter for blocking types
const activeBlockers = blockingDirectives.filter(d => 
  blockingDirectiveTypes.includes(d.type) && 
  ['pending', 'active'].includes(d.status)
);

if (activeBlockers.length > 0) {
  const blocker = activeBlockers[0]; // Highest priority blocker
  
  console.log(`[Auto Applier] BLOCKED by directive: ${blocker.title}`);
  
  // Broadcast to UI that application was blocked
  broadcastToUser({
    type: 'application_blocked_by_directive',
    user_id,
    data: {
      directive_id: blocker.id,
      directive_title: blocker.title,
      directive_type: blocker.type,
      reason: blocker.description,
      action_required: blocker.action_required,
      job_company: jobListing.company,
      job_role: jobListing.title,
    },
  });

  // Create notification for user
  await createNotification({
    user_id,
    type: 'agent',
    priority: 'high',
    title: `⏸️ Application Blocked: ${jobListing.company}`,
    message: `Strategic directive "${blocker.title}" is active. ${blocker.description}`,
    action_url: '/dashboard/agent-requests?tab=directives',
    action_label: 'View Directive',
    metadata: {
      directive_id: blocker.id,
      blocked_job_id: job_listing_id,
    },
  });

  await markEventCompleted(event_id);
  
  return {
    success: true,
    applied: false,
    reason: 'blocked_by_directive',
    directive_id: blocker.id,
    directive_title: blocker.title,
    user_id,
    job_listing_id,
  };
}
```

---

### Task 4.2: Create Directive Checker Utility
**File:** `src/lib/agents/utils/directive-checker.ts` (new)  
**Effort:** 1 hour

Centralized utility for all agents to check directives:

```typescript
/**
 * Directive Checker Utility
 * 
 * Provides a consistent way for agents to check and respond to strategic directives.
 */

import { getActiveDirectives, type DirectiveType } from '@/services/strategic-directives';
import { type StrategicDirective } from '@/drizzle/schema';

export interface DirectiveCheckResult {
  blocked: boolean;
  directive?: StrategicDirective;
  reason?: string;
  requiredAction?: string;
}

export interface DirectiveCheckOptions {
  userId: string;
  agentType: 'action' | 'resume' | 'architect' | 'sentinel';
  operation: 'apply' | 'update_resume' | 'update_roadmap' | 'scrape';
}

// Mapping of which directive types block which operations
const BLOCKING_RULES: Record<string, DirectiveType[]> = {
  'action:apply': ['pause_applications', 'focus_shift'],
  'resume:update_resume': ['resume_rewrite'], // Doesn't block, but modifies behavior
  'architect:update_roadmap': ['skill_priority', 'rejection_insight'],
};

/**
 * Check if any active directives block the given operation
 */
export async function checkDirectivesForOperation(
  options: DirectiveCheckOptions
): Promise<DirectiveCheckResult> {
  const { userId, agentType, operation } = options;
  const ruleKey = `${agentType}:${operation}`;
  
  // Get blocking directive types for this operation
  const blockingTypes = BLOCKING_RULES[ruleKey] || [];
  
  if (blockingTypes.length === 0) {
    return { blocked: false };
  }

  // Fetch active directives for this agent
  const directives = await getActiveDirectives(userId, {
    target_agent: agentType,
  });

  // Find first blocking directive
  for (const directive of directives) {
    if (blockingTypes.includes(directive.type as DirectiveType)) {
      // Special case: resume_rewrite doesn't block, it guides
      if (directive.type === 'resume_rewrite') {
        return {
          blocked: false,
          directive,
          reason: 'Resume update guided by directive',
          requiredAction: directive.action_required || undefined,
        };
      }

      return {
        blocked: true,
        directive,
        reason: directive.description,
        requiredAction: directive.action_required || undefined,
      };
    }
  }

  return { blocked: false };
}

/**
 * Get all active directives relevant to an agent
 */
export async function getAgentDirectives(
  userId: string,
  agentType: 'action' | 'resume' | 'architect' | 'sentinel'
): Promise<StrategicDirective[]> {
  return getActiveDirectives(userId, {
    target_agent: agentType,
  });
}

/**
 * Check if a specific directive type is active
 */
export async function isDirectiveActive(
  userId: string,
  directiveType: DirectiveType
): Promise<{ active: boolean; directive?: StrategicDirective }> {
  const directives = await getActiveDirectives(userId, {
    type: directiveType,
  });

  if (directives.length > 0) {
    return { active: true, directive: directives[0] };
  }

  return { active: false };
}
```

---

### Task 4.3: Strategist Auto-Issue Logic in Weekly Sprint
**File:** `src/trigger/jobs/weekly-career-sprint.ts`  
**Effort:** 1.5 hours

After strategist analysis, automatically issue directives based on findings:

```typescript
// After line ~350 (after strategist analysis completes)

// =========================================================================
// Phase 1.5: Auto-Issue Directives Based on Analysis
// =========================================================================
console.log(`[Sprint] Phase 1.5: Evaluating directive triggers`);

import {
  issuePauseApplicationsDirective,
  issueResumeRewriteDirective,
  issueSkillPriorityDirective,
  issueRejectionInsightDirective,
} from '@/services/strategic-directives';

const directivesIssued: string[] = [];

// Trigger 1: Burnout Risk (high velocity + declining quality)
if (analysisResult.application_velocity > 20 && analysisResult.interview_rate < 5) {
  const directive = await issuePauseApplicationsDirective(user_id, {
    reason: 'burnout_risk',
    recommended_duration_days: 3,
    activities_to_focus: [
      'Review and improve resume targeting',
      'Analyze rejection patterns',
      'Practice interview skills',
    ],
  });
  directivesIssued.push(`pause_applications: ${directive.title}`);
  console.log(`[Sprint] Issued pause_applications directive: Burnout risk detected`);
}

// Trigger 2: Low Response Rate
if (analysisResult.response_rate < 5 && analysisResult.total_applications > 10) {
  const directive = await issueResumeRewriteDirective(user_id, {
    response_rate: analysisResult.response_rate,
    suggested_changes: [
      'Add more quantifiable achievements',
      'Include keywords from target job descriptions',
      'Simplify formatting for ATS compatibility',
    ],
    target_keywords: analysisResult.market_keywords?.slice(0, 5),
  });
  directivesIssued.push(`resume_rewrite: ${directive.title}`);
  console.log(`[Sprint] Issued resume_rewrite directive: Low response rate`);
}

// Trigger 3: Rejection Skill Gaps
if (rejectionReport.top_skill_gaps.length >= 2) {
  const directive = await issueRejectionInsightDirective(user_id, {
    rejection_patterns: rejectionReport.common_patterns || [],
    skill_gaps: rejectionReport.top_skill_gaps.map(g => g.skill),
    recommendations: [
      `Focus learning on: ${rejectionReport.top_skill_gaps.map(g => g.skill).join(', ')}`,
      'Consider certifications in gap areas',
      'Add projects demonstrating these skills',
    ],
  });
  directivesIssued.push(`rejection_insight: ${directive.title}`);
  console.log(`[Sprint] Issued rejection_insight directive: Skill gaps detected`);
}

// Trigger 4: Market Demand Shift
if (analysisResult.market_trends?.emerging_skills?.length > 0) {
  const currentSkills = userProfile.skills || [];
  const missingHighDemand = analysisResult.market_trends.emerging_skills
    .filter((s: string) => !currentSkills.includes(s.toLowerCase()))
    .slice(0, 3);

  if (missingHighDemand.length >= 2) {
    const directive = await issueSkillPriorityDirective(user_id, {
      priority_skills: missingHighDemand,
      reason: 'Market analysis shows high demand for these skills in your target role',
      skill_gaps: missingHighDemand,
    });
    directivesIssued.push(`skill_priority: ${directive.title}`);
    console.log(`[Sprint] Issued skill_priority directive: Market trends`);
  }
}

// Broadcast directives issued
if (directivesIssued.length > 0) {
  broadcastToUser({
    type: 'directive_issued',
    user_id,
    data: {
      count: directivesIssued.length,
      directives: directivesIssued,
      message: `Strategist issued ${directivesIssued.length} new directive(s)`,
    },
  });
}

result.directives_issued = directivesIssued;
```

---

### Task 4.4: Enhanced Directives List UI
**File:** `src/components/agent-control/directives-list.tsx`  
**Effort:** 2 hours

Redesign to show directive impact and actions:

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  FileText,
  Pause,
  TrendingUp,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Directive {
  id: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  reasoning?: string;
  target_agent?: string;
  action_required?: string;
  context?: Record<string, unknown>;
  issued_at: string;
  expires_at?: string;
}

const directiveTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pause_applications: { icon: Pause, color: 'bg-orange-500', label: 'Pause' },
  resume_rewrite: { icon: FileText, color: 'bg-blue-500', label: 'Resume' },
  skill_priority: { icon: Target, color: 'bg-purple-500', label: 'Skills' },
  rejection_insight: { icon: AlertTriangle, color: 'bg-red-500', label: 'Insight' },
  focus_shift: { icon: TrendingUp, color: 'bg-green-500', label: 'Focus' },
  ghosting_response: { icon: Clock, color: 'bg-gray-500', label: 'Follow-up' },
};

const priorityColors: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-gray-400 text-white',
};

export function DirectivesList() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: directives, isLoading } = useQuery({
    queryKey: ['directives'],
    queryFn: async () => {
      const res = await fetch('/api/agents/directives');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<Directive[]>;
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (directiveId: string) => {
      const res = await fetch(`/api/agents/directives/${directiveId}/complete`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to complete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directives'] });
      toast.success('Directive marked as complete');
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (directiveId: string) => {
      const res = await fetch(`/api/agents/directives/${directiveId}/dismiss`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to dismiss');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directives'] });
      toast.info('Directive dismissed');
    },
  });

  if (isLoading) {
    return <div className="animate-pulse h-48 bg-muted rounded-lg" />;
  }

  const activeDirectives = directives?.filter(d => 
    ['pending', 'active'].includes(d.status)
  ) || [];

  if (activeDirectives.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
          <p className="text-lg font-medium">All Clear</p>
          <p className="text-muted-foreground text-sm">
            No active strategic directives. Agents are operating normally.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {activeDirectives.map((directive) => {
        const typeConfig = directiveTypeConfig[directive.type] || {
          icon: AlertTriangle,
          color: 'bg-gray-500',
          label: directive.type,
        };
        const Icon = typeConfig.icon;
        const isExpanded = expandedId === directive.id;

        return (
          <Card key={directive.id} className="border-l-4" style={{ borderLeftColor: typeConfig.color.replace('bg-', '') }}>
            <Collapsible open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : directive.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${typeConfig.color}`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{directive.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={priorityColors[directive.priority]}>
                          {directive.priority}
                        </Badge>
                        <Badge variant="outline">{typeConfig.label}</Badge>
                        {directive.target_agent && (
                          <Badge variant="secondary">
                            Target: {directive.target_agent}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {isExpanded ? <ChevronUp /> : <ChevronDown />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </CardHeader>

              <CardContent>
                <p className="text-muted-foreground mb-4">{directive.description}</p>

                <CollapsibleContent className="space-y-4">
                  {directive.reasoning && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Reasoning</p>
                      <p className="text-sm text-muted-foreground">{directive.reasoning}</p>
                    </div>
                  )}

                  {directive.action_required && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm font-medium mb-1 text-blue-800 dark:text-blue-200">
                        Action Required
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {directive.action_required}
                      </p>
                    </div>
                  )}

                  {directive.context && Object.keys(directive.context).length > 0 && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-2">Context</p>
                      <pre className="text-xs overflow-auto max-h-32">
                        {JSON.stringify(directive.context, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDistanceToNow(new Date(directive.issued_at))} ago
                      {directive.expires_at && (
                        <> · Expires {formatDistanceToNow(new Date(directive.expires_at))}</>
                      )}
                    </p>

                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => completeMutation.mutate(directive.id)}
                        disabled={completeMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Mark Complete
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <XCircle className="h-4 w-4 mr-1" />
                            Dismiss
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Dismiss Directive?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will cancel the directive without completing the required action.
                              The Strategist may re-issue a similar directive in the future.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => dismissMutation.mutate(directive.id)}
                            >
                              Dismiss
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CollapsibleContent>
              </CardContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
```

---

### Task 4.5: Directive API Routes
**File:** `src/app/api/agents/directives/route.ts` (modify)  
**File:** `src/app/api/agents/directives/[id]/complete/route.ts` (new)  
**File:** `src/app/api/agents/directives/[id]/dismiss/route.ts` (new)  
**Effort:** 1 hour

```typescript
// src/app/api/agents/directives/[id]/complete/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { completeDirectiveExecution, startDirectiveExecution } from '@/services/strategic-directives';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Start execution (for logging)
    const { log_id } = await startDirectiveExecution(params.id, 'user');

    // Complete it
    await completeDirectiveExecution(params.id, log_id, {
      success: true,
      logs: 'Manually marked complete by user',
      execution_time_ms: 0,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to complete' }, { status: 500 });
  }
}
```

```typescript
// src/app/api/agents/directives/[id]/dismiss/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cancelDirective } from '@/services/strategic-directives';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await cancelDirective(params.id, 'Dismissed by user');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
  }
}
```

---

### Task 4.6: Add Directive Banner to Dashboard
**File:** `src/components/dashboard/directive-banner.tsx` (new)  
**Effort:** 1 hour

Show active blocking directives at the top of the dashboard:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function DirectiveBanner() {
  const { data: stats } = useQuery({
    queryKey: ['agent-control-stats'],
    queryFn: async () => {
      const res = await fetch('/api/agents/control-room/stats');
      return res.json();
    },
  });

  const { data: directives } = useQuery({
    queryKey: ['blocking-directives'],
    queryFn: async () => {
      const res = await fetch('/api/agents/directives?blocking=true');
      return res.json();
    },
    enabled: (stats?.active_directives || 0) > 0,
  });

  const blockingDirective = directives?.[0];

  if (!blockingDirective) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="text-lg">
        🚨 Strategic Directive Active
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-2">
          <strong>{blockingDirective.title}</strong>
        </p>
        <p className="text-sm opacity-90 mb-3">
          {blockingDirective.description}
        </p>
        {blockingDirective.action_required && (
          <p className="text-sm font-medium mb-3">
            Required: {blockingDirective.action_required}
          </p>
        )}
        <Link href="/dashboard/agent-requests?tab=directives">
          <Button variant="secondary" size="sm">
            View Directive <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
```

**Add to dashboard layout:**

```tsx
// src/app/(dashboard)/dashboard/page.tsx

import { DirectiveBanner } from '@/components/dashboard/directive-banner';

export default function DashboardPage() {
  return (
    <div>
      <DirectiveBanner />
      {/* rest of dashboard */}
    </div>
  );
}
```

---

## 5. Code Changes Required

### Summary of Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/trigger/jobs/auto-applier.ts` | Modify | Add directive check before applying |
| `src/trigger/jobs/weekly-career-sprint.ts` | Modify | Add auto-issue logic after analysis |
| `src/lib/agents/utils/directive-checker.ts` | Create | Centralized directive checking utility |
| `src/components/agent-control/directives-list.tsx` | Rewrite | Enhanced UI with actions |
| `src/components/dashboard/directive-banner.tsx` | Create | Banner for blocking directives |
| `src/app/api/agents/directives/[id]/complete/route.ts` | Create | Complete directive endpoint |
| `src/app/api/agents/directives/[id]/dismiss/route.ts` | Create | Dismiss directive endpoint |
| `src/services/realtime/index.ts` | Modify | Add `application_blocked_by_directive` event |

---

## 6. Directive Scenarios

### Scenario 1: Burnout Prevention
```
Trigger: User applied to 25+ jobs in 7 days with <3% interview rate
Directive: pause_applications (3 days)
Action: Block all auto-applications
Required: "Complete resume review session"
Resolution: User marks complete OR 3 days pass
```

### Scenario 2: Resume Quality Alert
```
Trigger: Response rate <5% after 15 applications
Directive: resume_rewrite (critical)
Action: Prioritize resume update before more applications
Required: "Update resume with suggested keywords"
Resolution: User updates resume and marks complete
```

### Scenario 3: Skill Gap Focus
```
Trigger: 3 rejections cite "system design" as weakness
Directive: skill_priority (high)
Action: Architect Agent prioritizes system design in roadmap
Required: "Complete 2 system design practice problems"
Resolution: User completes learning module
```

### Scenario 4: Market Pivot
```
Trigger: Target role demand dropped 40% in 30 days
Directive: focus_shift (high)
Action: Suggest alternative role with higher demand
Required: "Review suggested pivot: Data Engineer → ML Engineer"
Resolution: User acknowledges and updates preferences
```

---

## 7. UI/UX Design

### Directive Card States

```
┌─────────────────────────────────────────────────────────────┐
│ 🟠 PAUSE_APPLICATIONS                           HIGH        │
├─────────────────────────────────────────────────────────────┤
│ Applications Paused: Focus on Skill Building                │
│                                                             │
│ Analysis detected burnout risk: 25 applications in 7 days   │
│ with only 2% interview rate.                                │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 📋 Action Required                                       ││
│ │ • Complete resume review session                         ││
│ │ • Review top 5 rejection reasons                         ││
│ │ • Update skills section with market keywords             ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Issued 2 hours ago · Expires in 3 days                      │
│                                                             │
│ [✓ Mark Complete]  [✕ Dismiss]  [View Details →]            │
└─────────────────────────────────────────────────────────────┘
```

### Dashboard Banner (Blocking State)

```
┌─────────────────────────────────────────────────────────────┐
│ 🚨 STRATEGIC DIRECTIVE ACTIVE                               │
│                                                             │
│ Applications Paused: Focus on Skill Building                │
│                                                             │
│ Your autonomous job applications are temporarily paused.    │
│ Complete the required actions to resume.                    │
│                                                             │
│ [View Directive →]                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Testing Strategy

### Unit Tests

```typescript
// src/lib/agents/utils/__tests__/directive-checker.test.ts

describe('checkDirectivesForOperation', () => {
  it('should block apply when pause_applications is active', async () => {
    // Setup: Create active pause_applications directive
    await db.insert(strategicDirectives).values({
      user_id: 'test-user',
      type: 'pause_applications',
      status: 'active',
      target_agent: 'action',
      title: 'Test Pause',
      description: 'Test',
    });

    const result = await checkDirectivesForOperation({
      userId: 'test-user',
      agentType: 'action',
      operation: 'apply',
    });

    expect(result.blocked).toBe(true);
    expect(result.directive?.type).toBe('pause_applications');
  });

  it('should allow apply when no blocking directives', async () => {
    const result = await checkDirectivesForOperation({
      userId: 'test-user-clean',
      agentType: 'action',
      operation: 'apply',
    });

    expect(result.blocked).toBe(false);
  });
});
```

### Integration Test

```typescript
// Test full flow: Issue directive → Auto-applier blocked → UI shows

describe('Directive blocking flow', () => {
  it('should block application and notify user', async () => {
    // 1. Issue pause directive
    await issuePauseApplicationsDirective('user-1', {
      reason: 'burnout_risk',
      recommended_duration_days: 1,
      activities_to_focus: ['rest'],
    });

    // 2. Trigger auto-applier
    const result = await autoApplier.run({
      event_id: 'test-event',
      user_id: 'user-1',
      job_listing_id: 'job-1',
      match_score: 90,
      matching_skills: ['python'],
      missing_skills: [],
    });

    // 3. Verify blocked
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('blocked_by_directive');

    // 4. Verify notification created
    const notifications = await db.query.notifications.findMany({
      where: eq(notifications.user_id, 'user-1'),
    });
    expect(notifications.some(n => n.title.includes('Blocked'))).toBe(true);
  });
});
```

---

## 9. Demo Scenario

### "The Strategist Override Demo" (90 seconds)

**Setup:**
1. User has 20+ applications with 2% interview rate
2. 3 recent rejections mention "system design"

**Script:**
1. **Start:** "Watch the Strategist analyze this job seeker's situation..."

2. **Trigger Weekly Sprint:** Click "Run Analysis"
   - Show: "Analyzing application history..."
   - Show: "Detecting patterns in rejections..."
   - Show: "Evaluating burnout risk..."

3. **Directive Issued:** 
   - 🚨 Banner appears: "Strategic Directive Issued"
   - Show directive card: "Applications Paused: Skill Gap Detected"
   - Highlight reasoning: "3 rejections cited system design"

4. **Blocked Application:**
   - Try to apply to a job (manually or auto)
   - Show toast: "Application blocked by directive"
   - Show: "Complete required action to resume"

5. **Resolution:**
   - Click "View Directive"
   - Show action required: "Complete 2 system design exercises"
   - Click "Mark Complete"
   - Show: "Directive resolved. Applications resumed."

6. **Final Message:**
   - "The Strategist agent autonomously protected this user from wasted applications while focusing on skill improvement."

---

## Checklist

- [ ] Task 4.1: Directive check in auto-applier
- [ ] Task 4.2: Directive checker utility
- [ ] Task 4.3: Auto-issue logic in weekly sprint
- [ ] Task 4.4: Enhanced directives list UI
- [ ] Task 4.5: Complete/dismiss API routes
- [ ] Task 4.6: Dashboard directive banner
- [ ] Unit tests for directive checker
- [ ] Integration test for blocking flow
- [ ] Demo rehearsal

---

## Appendix: Event Types

Add to `src/services/realtime/index.ts`:

```typescript
export type AgentEventType =
  | 'sprint_started'
  | 'sprint_progress'
  | 'sprint_complete'
  | 'directive_issued'
  | 'directive_completed'
  | 'directive_dismissed'
  | 'application_blocked_by_directive'  // NEW
  | 'application_submitted'
  | 'application_draft_created'
  | 'ghosting_detected'
  | 'rejection_analyzed'
  | 'approval_needed'
  | 'resume_updated'
  | 'agent_status_changed';
```
