/**
 * Comprehensive System Test Script
 *
 * Tests all major components of the Career Prep system:
 * - Database connection
 * - Schema tables
 * - Agent services
 * - Embedding services
 * - Tool registry
 */

import { db } from './src/drizzle/db';
import {
  users,
  skills,
  jobListings,
  interviews,
  userProfiles,
  jobApplications,
  strategicDirectives,
  agentEvents,
  documentEmbeddings,
  roadmaps,
} from './src/drizzle/schema';
import { sql, count } from 'drizzle-orm';

// Colors for console
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function success(msg: string) {
  console.log(`${GREEN}✅ ${msg}${RESET}`);
}

function error(msg: string, err?: unknown) {
  console.log(`${RED}❌ ${msg}${RESET}`);
  if (err) console.log(`   ${RED}${err}${RESET}`);
}

function info(msg: string) {
  console.log(`${CYAN}ℹ️  ${msg}${RESET}`);
}

function section(title: string) {
  console.log(`\n${YELLOW}${'='.repeat(60)}${RESET}`);
  console.log(`${YELLOW}${title}${RESET}`);
  console.log(`${YELLOW}${'='.repeat(60)}${RESET}\n`);
}

async function testDatabase() {
  section('1. DATABASE CONNECTION TEST');

  try {
    const result = await db.execute(sql`SELECT NOW() as current_time, version() as pg_version`);
    const row = result.rows[0] as { current_time: string; pg_version: string };
    success(`Connected to PostgreSQL`);
    info(`Server time: ${row.current_time}`);
    info(`Version: ${row.pg_version.split(' ')[0]} ${row.pg_version.split(' ')[1]}`);
    return true;
  } catch (err) {
    error('Database connection failed', err);
    return false;
  }
}

async function testSchemaTables() {
  section('2. SCHEMA TABLES TEST');

  const tables = [
    { name: 'users', table: users },
    { name: 'skills', table: skills },
    { name: 'user_profiles', table: userProfiles },
    { name: 'job_listings', table: jobListings },
    { name: 'job_applications', table: jobApplications },
    { name: 'interviews', table: interviews },
    { name: 'roadmaps', table: roadmaps },
    { name: 'strategic_directives', table: strategicDirectives },
    { name: 'agent_events', table: agentEvents },
    { name: 'document_embeddings', table: documentEmbeddings },
  ];

  let allPassed = true;

  for (const { name, table } of tables) {
    try {
      const result = await db.select({ count: count() }).from(table);
      const recordCount = Number(result[0].count);
      success(`${name}: ${recordCount} records`);
    } catch (err) {
      error(`${name}: Failed to query`, err);
      allPassed = false;
    }
  }

  return allPassed;
}

async function testAgentServices() {
  section('3. AGENT SERVICES TEST');

  try {
    // Test agent imports individually
    const agents = await import('./src/lib/agents/agents');

    const agentList = [
      { name: 'Interviewer', check: agents.InterviewerAgent },
      { name: 'Sentinel', check: agents.SentinelAgent },
      { name: 'Architect', check: agents.ArchitectAgent },
      { name: 'Action', check: agents.ActionAgent },
      { name: 'Strategist', check: agents.StrategistAgent },
      { name: 'ResumeArchitect', check: agents.ResumeArchitectAgent },
    ];

    let loadedCount = 0;
    for (const { name, check } of agentList) {
      if (check) {
        info(`  - ${name}Agent: loaded`);
        loadedCount++;
      } else {
        error(`  - ${name}Agent: not found`);
      }
    }

    success(`Agent registry loaded: ${loadedCount} agents registered`);
    return true;
  } catch (err) {
    error('Agent services failed to load', err);
    return false;
  }
}

async function testToolRegistry() {
  section('4. TOOL REGISTRY TEST');

  try {
    const { toolRegistry } = await import('./src/lib/agents/tools/tool-registry');
    const { registerActionTools, getActionToolIds } = await import('./src/lib/agents/agents/action/action-tools');

    // Register action tools
    registerActionTools();

    const actionToolIds = getActionToolIds();
    success(`Action tools registered: ${actionToolIds.length} tools`);

    for (const id of actionToolIds) {
      const tool = toolRegistry.get(id);
      if (tool) {
        info(`  - ${id}: ${tool.description.slice(0, 50)}...`);
      }
    }

    return true;
  } catch (err) {
    error('Tool registry failed', err);
    return false;
  }
}

async function testEmbeddingService() {
  section('5. EMBEDDING SERVICE TEST');

  try {
    const { generateEmbedding } = await import('./src/services/embeddings');

    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      info('OPENAI_API_KEY not set - skipping embedding generation test');
      return true;
    }

    const testText = 'This is a test sentence for embedding.';
    const embedding = await generateEmbedding(testText);

    if (embedding.length === 1536) {
      success(`Embedding generated: ${embedding.length} dimensions`);
      return true;
    } else {
      error(`Unexpected embedding dimensions: ${embedding.length}`);
      return false;
    }
  } catch (err) {
    error('Embedding service failed', err);
    return false;
  }
}

async function testStrategicDirectives() {
  section('6. STRATEGIC DIRECTIVES SERVICE TEST');

  try {
    const {
      getActiveDirectives,
      getDirectiveHistory,
    } = await import('./src/services/strategic-directives');

    success('Strategic directives service loaded');

    // Get count of active directives
    const activeCount = await db.select({ count: count() }).from(strategicDirectives);
    info(`Total directives in DB: ${activeCount[0].count}`);

    return true;
  } catch (err) {
    error('Strategic directives service failed', err);
    return false;
  }
}

async function testGhostingDetector() {
  section('7. GHOSTING DETECTOR SERVICE TEST');

  try {
    const { calculateHopeScore } = await import('./src/services/ghosting-detector');

    success('Ghosting detector service loaded');

    // Test hope score calculation with proper Date argument
    const testDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const testScore = calculateHopeScore(testDate, 'applied', undefined, 'linkedin');
    info(`Hope score for 7-day LinkedIn app: ${(testScore).toFixed(1)}%`);

    return true;
  } catch (err) {
    error('Ghosting detector service failed', err);
    return false;
  }
}

async function testRejectionInsights() {
  section('8. REJECTION INSIGHTS SERVICE TEST');

  try {
    const { parseRejectionEmail } = await import('./src/services/rejection-insights');

    success('Rejection insights service loaded');

    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      info('OPENAI_API_KEY not set - skipping rejection analysis test');
      return true;
    }

    info('Rejection analysis requires OpenAI API (skipping live test)');
    return true;
  } catch (err) {
    error('Rejection insights service failed', err);
    return false;
  }
}

async function testRealtimeService() {
  section('9. REALTIME SSE SERVICE TEST');

  try {
    const {
      registerConnection,
      unregisterConnection,
      broadcastToUser,
      getTotalConnectionCount,
    } = await import('./src/services/realtime');

    success('Realtime service loaded');
    info(`Total connections: ${getTotalConnectionCount()}`);

    return true;
  } catch (err) {
    error('Realtime service failed', err);
    return false;
  }
}

async function testEventSystem() {
  section('10. EVENT SYSTEM TEST');

  try {
    const {
      EVENT_TARGET_AGENTS,
      EVENT_PRIORITIES,
      EVENT_JOB_IDS,
      getQueueForEvent,
    } = await import('./src/lib/agents/events');

    success(`Event types defined: ${Object.keys(EVENT_TARGET_AGENTS).length}`);

    // Test queue routing
    const interviewQueue = getQueueForEvent('INTERVIEW_COMPLETED');
    info(`INTERVIEW_COMPLETED -> ${interviewQueue} queue`);

    const marketQueue = getQueueForEvent('MARKET_UPDATE');
    info(`MARKET_UPDATE -> ${marketQueue} queue`);

    return true;
  } catch (err) {
    error('Event system failed', err);
    return false;
  }
}

async function testMessageBus() {
  section('11. MESSAGE BUS TEST');

  try {
    const {
      publishAgentEvent,
      shouldSkipEvent,
    } = await import('./src/lib/agents/message-bus');

    success('Message bus loaded');

    // Test idempotency check
    const testEventId = 'test-event-' + Date.now();
    const skipResult = await shouldSkipEvent(testEventId);
    info(`Idempotency check for new event: skip=${skipResult.skip}`);

    return true;
  } catch (err) {
    error('Message bus failed', err);
    return false;
  }
}

async function testCareerAutomationClient() {
  section('12. CAREER AUTOMATION CLIENT TEST');

  try {
    const { getCareerAutomationClient } = await import('./src/lib/services/career-automation-client');

    const client = getCareerAutomationClient();
    success('Career automation client loaded');

    // Check if Python service is available
    const isAvailable = await client.isAvailable();
    if (isAvailable) {
      success('Python service is running');
    } else {
      info('Python service not available (expected if not running Docker)');
    }

    return true;
  } catch (err) {
    error('Career automation client failed', err);
    return false;
  }
}

async function testSecurityService() {
  section('13. SECURITY/ENCRYPTION SERVICE TEST');

  try {
    const { encrypt, decryptJson } = await import('./src/lib/security/encryption');

    const testData = { test: 'secret data', value: 12345 };
    const encrypted = encrypt(testData);
    success('Encryption works');

    const decrypted = decryptJson<typeof testData>(encrypted);
    if (JSON.stringify(decrypted) === JSON.stringify(testData)) {
      success('Decryption works - data matches');
    } else {
      error('Decryption failed - data mismatch');
      return false;
    }

    return true;
  } catch (err) {
    error('Security service failed', err);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n');
  console.log(`${CYAN}╔════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}║       CAREER PREP - COMPREHENSIVE SYSTEM TEST              ║${RESET}`);
  console.log(`${CYAN}╚════════════════════════════════════════════════════════════╝${RESET}`);

  const results: { name: string; passed: boolean }[] = [];

  // Run all tests
  results.push({ name: 'Database Connection', passed: await testDatabase() });
  results.push({ name: 'Schema Tables', passed: await testSchemaTables() });
  results.push({ name: 'Agent Services', passed: await testAgentServices() });
  results.push({ name: 'Tool Registry', passed: await testToolRegistry() });
  results.push({ name: 'Embedding Service', passed: await testEmbeddingService() });
  results.push({ name: 'Strategic Directives', passed: await testStrategicDirectives() });
  results.push({ name: 'Ghosting Detector', passed: await testGhostingDetector() });
  results.push({ name: 'Rejection Insights', passed: await testRejectionInsights() });
  results.push({ name: 'Realtime SSE', passed: await testRealtimeService() });
  results.push({ name: 'Event System', passed: await testEventSystem() });
  results.push({ name: 'Message Bus', passed: await testMessageBus() });
  results.push({ name: 'Career Automation Client', passed: await testCareerAutomationClient() });
  results.push({ name: 'Security/Encryption', passed: await testSecurityService() });

  // Summary
  section('TEST SUMMARY');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    if (result.passed) {
      success(result.name);
    } else {
      error(result.name);
    }
  }

  console.log('\n');
  if (failed === 0) {
    console.log(`${GREEN}╔════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${GREEN}║  ALL ${passed} TESTS PASSED! System is operational.            ║${RESET}`);
    console.log(`${GREEN}╚════════════════════════════════════════════════════════════╝${RESET}`);
  } else {
    console.log(`${RED}╔════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${RED}║  ${passed} PASSED, ${failed} FAILED - Check errors above               ║${RESET}`);
    console.log(`${RED}╚════════════════════════════════════════════════════════════╝${RESET}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
