
  Task 1: Fix Transcript Not Capturing During Unexpected Disconnects

  Step 1.1: Add localStorage buffering for transcript messages
  // In interview-session.tsx
  // Buffer messages to localStorage on each new message
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`interview-${interviewId}-transcript`, JSON.stringify(messages));
    }
  }, [messages, interviewId]);

  Step 1.2: Create periodic auto-save (every 2 minutes)
  - New API route: src/app/api/interviews/[id]/autosave/route.ts
  - PATCH endpoint that saves current transcript without completing the interview
  - Call from interview-session.tsx using setInterval

  Step 1.3: Add beforeunload handler for browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (readyState === VoiceReadyState.OPEN) {
        // Attempt sync save or use navigator.sendBeacon}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [readyState]);

  Step 1.4: Improve disconnect recovery
  - Check localStorage on component mount for any unsaved transcript
  - Offer to recover previous session if found
  - Clear localStorage after successful save

  ---
  Task 2: Roadmap Page - Skill Gap Visualization

  Step 2.1: Fetch skill gap data
  // In roadmap/page.tsx, add query for user_skills with gap info
  const userSkills = await db.query.userSkills.findMany({
    where: eq(userSkills.user_id, userId),
    with: { skill: true },
  });
  const gapSkills = userSkills.filter(s => s.verification_metadata?.gap_identified);

  Step 2.2: Create SkillGapChart component
  - Horizontal bar chart showing claimed vs verified levels
  - Color coding: green (no gap), orange (gap), gray (unverified)

  Step 2.3: Create SkillProgressTimeline component
  - Timeline showing skill verifications from interviews
  - Plot confidence scores over time

  Step 2.4: Add skill-module mapping visualization
  - Show which modules target which gap skills
  - Visual connection between gap cards and module cards

  ---
  Task 3: Dashboard - Real-Time Interview Stats

  Step 3.1: Query interview data with analysis results
  const interviewsWithAnalysis = await db.query.interviews.findMany({
    where: and(
      eq(interviews.user_id, userId),
      eq(interviews.status, 'completed')
    ),
    orderBy: [desc(interviews.completed_at)],
    limit: 10,
  });

  Step 3.2: Create InterviewTrendsChart component
  - Line chart showing overall_score over time
  - Separate lines for communication, self-awareness, career-alignment

  Step 3.3: Create RecentInterviewCard component
  - Latest interview summary with:
    - Duration, score, dominant emotion
    - Key skills verified
    - Top recommendation

  Step 3.4: Add emotion insights section
  - Aggregate emotion data from all interviews
  - Show emotional trends (e.g., decreasing anxiety, increasing confidence)

  ---
  Would you like me to proceed with implementing any of these tasks?
    