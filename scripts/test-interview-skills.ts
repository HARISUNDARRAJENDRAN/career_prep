/**
 * Test script to verify skills are being loaded correctly for interviews
 *
 * Run with: npx tsx scripts/test-interview-skills.ts <user_clerk_id>
 */

import { db } from '../src/drizzle/db';
import { users, userProfiles, userSkills } from '../src/drizzle/schema';
import { eq } from 'drizzle-orm';

async function testInterviewSkills(userId: string) {
  console.log('='.repeat(60));
  console.log('Testing Interview Skills Loading');
  console.log('='.repeat(60));
  console.log(`User ID: ${userId}\n`);

  // 1. Check if user exists
  console.log('1. Checking if user exists...');
  const user = await db.query.users.findFirst({
    where: eq(users.clerk_id, userId),
  });

  if (!user) {
    console.log('   ❌ User NOT FOUND in database!');
    console.log('   This means the user has not completed onboarding or there is a user ID mismatch.');
    return;
  }
  console.log(`   ✅ User found: ${user.first_name} ${user.last_name} (${user.email})`);
  console.log(`   Onboarding completed: ${user.onboarding_completed}`);
  console.log(`   Current step: ${user.onboarding_step}\n`);

  // 2. Check user profile
  console.log('2. Checking user profile...');
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, userId),
  });

  if (!profile) {
    console.log('   ⚠️ No user profile found');
  } else {
    console.log(`   ✅ Profile found`);
    console.log(`   Target roles: ${profile.target_roles?.join(', ') || 'None'}`);
    console.log(`   Years of experience: ${profile.years_of_experience || 'Not set'}`);
  }
  console.log('');

  // 3. Check user skills (the critical part for interviews)
  console.log('3. Checking user skills...');
  const skills = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, userId),
    with: {
      skill: true,
    },
  });

  if (skills.length === 0) {
    console.log('   ❌ NO SKILLS FOUND for this user!');
    console.log('   This is why the interview agent has nothing to ask about.');
    console.log('\n   Possible causes:');
    console.log('   - Resume was not parsed correctly');
    console.log('   - Skills were not extracted from resume');
    console.log('   - User skipped the experience/skills step in onboarding');
    console.log('   - User ID mismatch between onboarding and interview');
    return;
  }

  console.log(`   ✅ Found ${skills.length} skills:\n`);

  // Display skills in a table format
  console.log('   | # | Skill Name              | Level       | Verified | Gap |');
  console.log('   |---|-------------------------|-------------|----------|-----|');

  skills.forEach((s, i) => {
    const name = (s.skill?.name || 'Unknown').padEnd(23);
    const level = (s.proficiency_level || 'unknown').padEnd(11);
    const verified = s.verification_metadata?.is_verified ? '✅' : '❌';
    const hasGap = s.verification_metadata?.gap_identified ? '⚠️' : '-';
    console.log(`   | ${String(i + 1).padStart(1)} | ${name} | ${level} | ${verified.padStart(4)}     | ${hasGap.padStart(2)}  |`);
  });

  console.log('\n');

  // 4. Simulate the context injection that would be built
  console.log('4. Simulating context injection for Hume AI...');

  const candidateContext = {
    name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Candidate' : 'Candidate',
    targetRoles: profile?.target_roles || [],
    skills: skills.map((s) => ({
      name: s.skill?.name || 'Unknown',
      claimedLevel: s.proficiency_level,
      isVerified: s.verification_metadata?.is_verified || false,
      hasGap: s.verification_metadata?.gap_identified || false,
      verifiedLevel: s.verification_metadata?.verified_level,
    })),
  };

  const priorityOrder = ['expert', 'proficient', 'practicing', 'learning', 'beginner'];
  const sortedSkills = [...candidateContext.skills].sort((a, b) => {
    return priorityOrder.indexOf(a.claimedLevel) - priorityOrder.indexOf(b.claimedLevel);
  });

  const skillsList = sortedSkills
    .map((s, i) => `${i + 1}. ${s.name}: Claimed Level = ${s.claimedLevel}${s.isVerified ? ' (already verified)' : ''}`)
    .join('\n');

  console.log('\n   Context that would be sent to Hume AI:');
  console.log('   '.repeat(1) + '-'.repeat(56));
  console.log(`   CANDIDATE PROFILE:
   - Name: ${candidateContext.name}
   - Target Roles: ${candidateContext.targetRoles.length > 0 ? candidateContext.targetRoles.join(', ') : 'Not specified'}

   SKILLS TO ASSESS:
${skillsList.split('\n').map(l => '   ' + l).join('\n')}
`);
  console.log('   '.repeat(1) + '-'.repeat(56));

  console.log('\n✅ Skills are properly set up for the interview agent!');
  console.log('   If the agent is still not asking about these skills,');
  console.log('   check the Hume AI configuration in the dashboard.');
}

// Get user ID from command line
const userId = process.argv[2];

if (!userId) {
  console.log('Usage: npx tsx scripts/test-interview-skills.ts <user_clerk_id>');
  console.log('\nTo find your Clerk user ID:');
  console.log('1. Go to the Clerk dashboard');
  console.log('2. Find your user and copy the user ID (starts with "user_")');
  process.exit(1);
}

testInterviewSkills(userId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
