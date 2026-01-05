/**
 * Test Script: Interview Analyzer Debug
 *
 * Run with: npx tsx scripts/test-interview-analyzer.ts
 *
 * This script helps diagnose why skill verification isn't working after interviews.
 */

import { db } from '../src/drizzle/db';
import { interviews, userSkills, skillVerifications, agentEvents } from '../src/drizzle/schema';
import { eq, desc, and } from 'drizzle-orm';

async function main() {
  console.log('='.repeat(60));
  console.log('Interview Analyzer Debug Script');
  console.log('='.repeat(60));

  // 1. Find the most recent completed interview
  console.log('\n[1] Finding most recent completed interview...');
  const recentInterview = await db.query.interviews.findFirst({
    where: eq(interviews.status, 'completed'),
    orderBy: desc(interviews.completed_at),
  });

  if (!recentInterview) {
    console.log('❌ No completed interviews found');
    process.exit(1);
  }

  console.log(`✓ Found interview: ${recentInterview.id}`);
  console.log(`  User ID: ${recentInterview.user_id}`);
  console.log(`  Type: ${recentInterview.type}`);
  console.log(`  Completed at: ${recentInterview.completed_at}`);
  console.log(`  Has transcript: ${!!(recentInterview.raw_data as any)?.transcript}`);
  console.log(`  Has analysis: ${!!(recentInterview.raw_data as any)?.analysis}`);

  // 2. Check if INTERVIEW_COMPLETED event was created
  console.log('\n[2] Checking for INTERVIEW_COMPLETED events...');
  const events = await db.query.agentEvents.findMany({
    where: eq(agentEvents.event_type, 'INTERVIEW_COMPLETED'),
    orderBy: desc(agentEvents.created_at),
    limit: 5,
  });

  if (events.length === 0) {
    console.log('❌ No INTERVIEW_COMPLETED events found');
    console.log('   This means the event is not being published when interviews complete.');
    console.log('   Check: src/app/api/interviews/[id]/complete/route.ts');
  } else {
    console.log(`✓ Found ${events.length} INTERVIEW_COMPLETED events`);
    for (const event of events) {
      const payload = event.payload as any;
      console.log(`  - ${event.id}: interview=${payload?.interview_id}, status=${event.status}`);
    }
  }

  // 3. Check user skills for this user
  console.log('\n[3] Checking user skills...');
  const skills = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, recentInterview.user_id),
    with: { skill: true },
  });

  console.log(`✓ Found ${skills.length} skills for user`);

  const verifiedCount = skills.filter(s => (s.verification_metadata as any)?.is_verified).length;
  const unverifiedCount = skills.length - verifiedCount;

  console.log(`  Verified: ${verifiedCount}`);
  console.log(`  Unverified: ${unverifiedCount}`);

  if (skills.length > 0) {
    console.log('\n  Sample skills:');
    skills.slice(0, 5).forEach(s => {
      const meta = s.verification_metadata as any;
      console.log(`    - ${s.skill?.name}: verified=${meta?.is_verified ?? false}, level=${s.proficiency_level}`);
    });
  }

  // 4. Check skill verifications table
  console.log('\n[4] Checking skill_verifications table...');
  const verifications = await db.query.skillVerifications.findMany({
    orderBy: desc(skillVerifications.created_at),
    limit: 10,
  });

  if (verifications.length === 0) {
    console.log('❌ No skill verification records found');
    console.log('   This means the interview analyzer is not running or not completing.');
  } else {
    console.log(`✓ Found ${verifications.length} verification records`);
    verifications.slice(0, 3).forEach(v => {
      console.log(`  - ${v.id}: type=${v.verification_type}, interview=${v.interview_id}`);
    });
  }

  // 5. Check environment
  console.log('\n[5] Checking environment...');
  console.log(`  TRIGGER_SECRET_KEY: ${process.env.TRIGGER_SECRET_KEY ? '✓ Set' : '❌ NOT SET'}`);
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ Set' : '❌ NOT SET'}`);

  // 6. Diagnosis
  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS');
  console.log('='.repeat(60));

  if (events.length === 0) {
    console.log('\n⚠️  ISSUE: Events are not being published');
    console.log('   Fix: Check if publishAgentEvent is being called in the complete route');
  } else if (events.every(e => e.status === 'pending')) {
    console.log('\n⚠️  ISSUE: Events are pending but not being processed');
    console.log('   Fix: Check if TRIGGER_SECRET_KEY is set and Trigger.dev worker is running');
  } else if (events.some(e => e.status === 'failed')) {
    console.log('\n⚠️  ISSUE: Some events failed');
    const failedEvent = events.find(e => e.status === 'failed');
    console.log(`   Error: ${failedEvent?.error_message || 'Unknown'}`);
  } else if (verifications.length === 0) {
    console.log('\n⚠️  ISSUE: Events processed but no verifications created');
    console.log('   Fix: Check interview-analyzer.ts for errors in skill assessment mapping');
  } else if (unverifiedCount > 0) {
    console.log('\n⚠️  ISSUE: Verifications exist but skills not marked as verified');
    console.log('   Fix: Check if user_skills table is being updated correctly');
  } else {
    console.log('\n✅ Everything looks good!');
  }

  console.log('\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
