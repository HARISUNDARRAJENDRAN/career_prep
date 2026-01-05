/**
 * Agent System Test API
 * 
 * Comprehensive testing endpoint for the multi-agent system.
 * This allows testing individual agents and full workflows.
 * 
 * Usage: POST /api/test/agents
 * 
 * @see docs/agentic-improvements/01-AGENTIC_ARCHITECTURE_OVERVIEW.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/drizzle/db';
import { userProfiles, userSkills, roadmaps, jobListings } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

// Import agent components for testing
import {
  // Core components
  createStateMachine,
  createMemoryManager,
  type EpisodeContext,
  // Reasoning layer
  createGoalDecomposer,
  createPlanGenerator,
  createConfidenceScorer,
  createIterationController,
  // Tools
  toolRegistry,
  createToolSelector,
  createToolExecutor,
  // Message bus
  messageBus,
} from '@/lib/agents';

// Import agents
import { createInterviewerAgent, registerInterviewerTools } from '@/lib/agents/agents/interviewer';
import { createSentinelAgent, registerSentinelTools } from '@/lib/agents/agents/sentinel';
import { createArchitectAgent, registerArchitectTools } from '@/lib/agents/agents/architect';
import { ActionAgent, registerActionTools } from '@/lib/agents/agents/action';

// Import workflow orchestrator
import { workflowOrchestrator } from '@/lib/agents/workflows';

type TestType = 
  | 'health'
  | 'core'
  | 'reasoning'
  | 'tools'
  | 'message-bus'
  | 'interviewer'
  | 'sentinel'
  | 'architect'
  | 'action'
  | 'workflow'
  | 'full';

interface TestResult {
  test: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  details?: unknown;
  error?: string;
}

interface TestReport {
  timestamp: string;
  test_type: TestType;
  user_id?: string;
  total_tests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  results: TestResult[];
}

/**
 * Run a single test with timing and error handling
 */
async function runTest(
  name: string,
  testFn: () => Promise<unknown>
): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const details = await testFn();
    return {
      test: name,
      status: 'passed',
      duration_ms: Date.now() - startTime,
      details,
    };
  } catch (error) {
    return {
      test: name,
      status: 'failed',
      duration_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

/**
 * Test core components (state machine, memory)
 */
async function testCoreComponents(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const taskId = 'test_task_' + Date.now();

  // Test State Machine
  results.push(await runTest('StateMachine: Create and initialize', async () => {
    const sm = await createStateMachine({
      agent_name: 'interviewer',
      task_id: taskId,
    });
    const state = sm.getState();
    return { initial_state: state };
  }));

  results.push(await runTest('StateMachine: Transition', async () => {
    const sm = await createStateMachine({
      agent_name: 'interviewer',
      task_id: taskId + '_2',
    });
    const result = await sm.transition({ type: 'START', payload: { task_id: taskId } });
    return { transitioned: result.success, new_state: sm.getState() };
  }));

  // Test Memory Manager
  results.push(await runTest('MemoryManager: Create and store', async () => {
    const memory = createMemoryManager({
      agent_name: 'interviewer',
      task_id: taskId,
    });
    memory.setWorking('test_key', { value: 42 });
    const retrieved = await memory.getWorking<{ value: number }>('test_key');
    if (retrieved?.value !== 42) throw new Error('Memory retrieval failed');
    return { stored_value: 42, retrieved: retrieved?.value };
  }));

  results.push(await runTest('MemoryManager: Record episode', async () => {
    const memory = createMemoryManager({
      agent_name: 'interviewer',
      task_id: taskId,
    });
    const context: EpisodeContext = {
      trigger_event: 'TEST_EVENT',
      input_summary: 'Test input',
    };
    await memory.recordEpisode({
      episode_type: 'test_action',
      action_taken: 'Testing',
      context,
      outcome: { 
        success: true, 
        result_summary: 'Test completed successfully',
        metrics: { duration_ms: 100 },
      },
    });
    const episodes = await memory.recallEpisodes({ limit: 1 });
    return { episodes_count: episodes.length };
  }));

  return results;
}

/**
 * Test reasoning layer components
 */
async function testReasoningLayer(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test Goal Decomposer
  results.push(await runTest('GoalDecomposer: Create instance', async () => {
    const decomposer = createGoalDecomposer({ model: 'gpt-4o-mini' });
    return { created: true, type: typeof decomposer };
  }));

  // Test Plan Generator
  results.push(await runTest('PlanGenerator: Create instance', async () => {
    const generator = createPlanGenerator({
      model: 'gpt-4o-mini',
      max_steps: 10,
      default_confidence_threshold: 0.8,
      default_max_iterations: 3,
    });
    return { created: true, type: typeof generator };
  }));

  // Test Confidence Scorer
  results.push(await runTest('ConfidenceScorer: Create instance', async () => {
    const scorer = createConfidenceScorer({
      model: 'gpt-4o-mini',
      default_threshold: 0.8,
      strict_mode: false,
    });
    return { created: true, type: typeof scorer };
  }));

  // Test Iteration Controller
  results.push(await runTest('IterationController: Create instance', async () => {
    const scorer = createConfidenceScorer({ model: 'gpt-4o-mini' });
    const generator = createPlanGenerator({ model: 'gpt-4o-mini' });
    const controller = createIterationController(scorer, generator, {
      conditions: {
        max_iterations: 3,
        confidence_threshold: 0.8,
        max_duration_ms: 60000,
        convergence_threshold: 0.02,
        max_degradations: 2,
      },
    });
    return { created: true, type: typeof controller };
  }));

  return results;
}

/**
 * Test tool system
 */
async function testToolSystem(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test Tool Registry
  results.push(await runTest('ToolRegistry: Check registered tools', async () => {
    const allTools = toolRegistry.getAll();
    return { 
      total_tools: allTools.length,
      categories: [...new Set(allTools.map(t => t.category))],
    };
  }));

  // Register agent tools
  results.push(await runTest('ToolRegistry: Register interviewer tools', async () => {
    registerInterviewerTools();
    return { registered: true };
  }));

  results.push(await runTest('ToolRegistry: Register sentinel tools', async () => {
    registerSentinelTools();
    return { registered: true };
  }));

  results.push(await runTest('ToolRegistry: Register architect tools', async () => {
    registerArchitectTools();
    return { registered: true };
  }));

  results.push(await runTest('ToolRegistry: Register action tools', async () => {
    registerActionTools();
    return { registered: true };
  }));

  // Test Tool Selector
  results.push(await runTest('ToolSelector: Create instance', async () => {
    const selector = createToolSelector({ model: 'gpt-4o-mini' });
    return { created: true, type: typeof selector };
  }));

  // Test Tool Executor
  results.push(await runTest('ToolExecutor: Create instance', async () => {
    const executor = createToolExecutor({
      default_timeout_ms: 30000,
      default_max_retries: 2,
      enable_logging: true,
    });
    return { created: true, type: typeof executor };
  }));

  return results;
}

/**
 * Test message bus
 */
async function testMessageBus(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test subscription
  results.push(await runTest('MessageBus: Subscribe to topic', async () => {
    let subscribed = false;
    const unsubscribe = messageBus.subscribe('interview_completed', () => {
      subscribed = true;
    });
    const subscriberCount = messageBus.getSubscriberCount('interview_completed');
    unsubscribe();
    return { subscribed: true, subscriber_count: subscriberCount };
  }));

  // Test publish
  results.push(await runTest('MessageBus: Publish message', async () => {
    let receivedPayload: unknown = null;
    const unsubscribe = messageBus.subscribe('job_match_found', (payload) => {
      receivedPayload = payload;
    });
    
    await messageBus.publish('job_match_found', {
      user_id: 'test_user',
      job_id: 'test_job',
      match_score: 85,
      matching_skills: ['TypeScript', 'React'],
      missing_skills: ['GraphQL'],
    });
    
    unsubscribe();
    return { published: true, received: receivedPayload !== null };
  }));

  return results;
}

/**
 * Test Interviewer Agent
 */
async function testInterviewerAgent(userId: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('InterviewerAgent: Create instance', async () => {
    const agent = createInterviewerAgent({
      interview_id: 'test_interview_' + Date.now(),
      user_id: userId,
      transcript: 'Test interview transcript',
      interview_type: 'behavioral',
      duration_minutes: 30,
    }, {
      max_iterations: 2,
      confidence_threshold: 0.7,
      timeout_ms: 30000,
    });
    return { created: true };
  }));

  // Note: Full interview analysis requires actual interview data
  results.push({
    test: 'InterviewerAgent: Full analysis (requires interview data)',
    status: 'skipped',
    duration_ms: 0,
    details: { reason: 'Requires actual interview session data' },
  });

  return results;
}

/**
 * Test Sentinel Agent
 */
async function testSentinelAgent(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('SentinelAgent: Create instance', async () => {
    const taskId = 'test_sentinel_' + Date.now();
    const agent = createSentinelAgent(taskId, {
      max_iterations: 2,
      confidence_threshold: 0.7,
      timeout_ms: 60000,
    });
    return { created: true, task_id: taskId };
  }));

  // Note: Full market scraping would make external calls
  results.push({
    test: 'SentinelAgent: Market scraping (external API)',
    status: 'skipped',
    duration_ms: 0,
    details: { reason: 'Would make external API calls' },
  });

  return results;
}

/**
 * Test Architect Agent
 */
async function testArchitectAgent(userId: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('ArchitectAgent: Create instance', async () => {
    const taskId = 'test_architect_' + Date.now();
    const agent = createArchitectAgent(taskId, userId, {
      max_iterations: 2,
      confidence_threshold: 0.7,
      timeout_ms: 60000,
    });
    return { created: true, task_id: taskId };
  }));

  // Note: Full roadmap generation requires OpenAI API calls
  results.push({
    test: 'ArchitectAgent: Roadmap generation (requires API)',
    status: 'skipped',
    duration_ms: 0,
    details: { reason: 'Requires OpenAI API call' },
  });

  return results;
}

/**
 * Test Action Agent
 */
async function testActionAgent(userId: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('ActionAgent: Create instance', async () => {
    const agent = new ActionAgent({
      user_id: userId,
      mode: 'prioritize',
      max_applications: 5,
    });
    return { created: true, mode: 'prioritize' };
  }));

  results.push({
    test: 'ActionAgent: Job application (requires job listing)',
    status: 'skipped',
    duration_ms: 0,
    details: { reason: 'Requires actual job listing' },
  });

  return results;
}

/**
 * Test Workflow Orchestrator
 */
async function testWorkflowOrchestrator(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('WorkflowOrchestrator: List workflows', async () => {
    const workflows = workflowOrchestrator.listWorkflows();
    return { 
      workflow_count: workflows.length,
      workflows: workflows.map(w => ({ id: w.id, name: w.name })),
    };
  }));

  results.push(await runTest('WorkflowOrchestrator: Get workflow by ID', async () => {
    const workflows = workflowOrchestrator.listWorkflows();
    if (workflows.length === 0) {
      return { found: false, reason: 'No workflows registered' };
    }
    return { found: true, workflow_id: workflows[0].id };
  }));

  return results;
}

/**
 * Test database connectivity
 */
async function testDatabaseConnectivity(userId?: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('Database: Connection test', async () => {
    await db.execute('SELECT 1 as test');
    return { connected: true };
  }));

  if (userId) {
    results.push(await runTest('Database: Fetch user profile', async () => {
      const profile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.user_id, userId),
      });
      return { 
        found: !!profile,
        has_target_roles: !!profile?.target_roles?.length,
      };
    }));

    results.push(await runTest('Database: Fetch user skills', async () => {
      const skills = await db.query.userSkills.findMany({
        where: eq(userSkills.user_id, userId),
        limit: 10,
      });
      return { skill_count: skills.length };
    }));

    results.push(await runTest('Database: Fetch user roadmaps', async () => {
      const userRoadmaps = await db.query.roadmaps.findMany({
        where: eq(roadmaps.user_id, userId),
        limit: 5,
      });
      return { roadmap_count: userRoadmaps.length };
    }));
  }

  results.push(await runTest('Database: Fetch job listings sample', async () => {
    const jobs = await db.query.jobListings.findMany({
      limit: 5,
    });
    return { job_count: jobs.length };
  }));

  return results;
}

/**
 * Main test handler
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { userId } = await auth();
    const body = await request.json();
    const testType: TestType = body.test_type || 'health';
    
    const results: TestResult[] = [];

    // Always run health check
    results.push(await runTest('Health: API endpoint', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }));

    // Run database tests
    if (['health', 'full'].includes(testType)) {
      results.push(...await testDatabaseConnectivity(userId || undefined));
    }

    // Run specific test suites based on test_type
    if (['core', 'full'].includes(testType)) {
      results.push(...await testCoreComponents());
    }

    if (['reasoning', 'full'].includes(testType)) {
      results.push(...await testReasoningLayer());
    }

    if (['tools', 'full'].includes(testType)) {
      results.push(...await testToolSystem());
    }

    if (['message-bus', 'full'].includes(testType)) {
      results.push(...await testMessageBus());
    }

    if (userId) {
      if (['interviewer', 'full'].includes(testType)) {
        results.push(...await testInterviewerAgent(userId));
      }

      if (['sentinel', 'full'].includes(testType)) {
        results.push(...await testSentinelAgent());
      }

      if (['architect', 'full'].includes(testType)) {
        results.push(...await testArchitectAgent(userId));
      }

      if (['action', 'full'].includes(testType)) {
        results.push(...await testActionAgent(userId));
      }
    } else if (['interviewer', 'sentinel', 'architect', 'action'].includes(testType)) {
      results.push({
        test: `${testType}: Authentication required`,
        status: 'skipped',
        duration_ms: 0,
        details: { reason: 'User must be authenticated for agent tests' },
      });
    }

    if (['workflow', 'full'].includes(testType)) {
      results.push(...await testWorkflowOrchestrator());
    }

    // Compile report
    const report: TestReport = {
      timestamp: new Date().toISOString(),
      test_type: testType,
      user_id: userId || undefined,
      total_tests: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      duration_ms: Date.now() - startTime,
      results,
    };

    const status = report.failed > 0 ? 500 : 200;
    return NextResponse.json(report, { status });

  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json({
      error: 'Test execution failed',
      message: (error as Error).message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

/**
 * GET handler for simple health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Agent Test API is running',
    available_tests: [
      'health',
      'core',
      'reasoning', 
      'tools',
      'message-bus',
      'interviewer',
      'sentinel',
      'architect',
      'action',
      'workflow',
      'full',
    ],
    usage: 'POST /api/test/agents with { "test_type": "<test_name>" }',
  });
}
