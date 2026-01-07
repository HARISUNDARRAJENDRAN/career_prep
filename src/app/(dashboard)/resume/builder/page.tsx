import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/drizzle/db';
import { users, userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { ResumeBuilder } from '@/components/resume/resume-builder';

export default async function ResumeBuilderPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Fetch user profile with resume data
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerk_id, user.id),
  });

  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, user.id),
  });

  if (!dbUser?.onboarding_completed) {
    redirect('/onboarding');
  }

  // Transform profile data for the builder
  const initialProfile = {
    name: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim() || user.fullName || '',
    email: dbUser.email,
    phone: '',
    location: profile?.preferred_locations?.[0] || '',
    linkedin: '',
    github: '',
    portfolio: '',
    summary: profile?.bio || '',
    experience: (profile?.work_history || []).map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location || '',
      start_date: job.start_date,
      end_date: job.end_date || 'Present',
      bullets: job.description ? [job.description] : [],
    })),
    education: (profile?.education || []).map((edu) => ({
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field_of_study || '',
      graduation_date: edu.end_date || '',
      gpa: edu.gpa?.toString() || '',
    })),
    skills: {
      technical: profile?.resume_parsed_data?.skills || [],
      soft: [],
      languages: profile?.resume_parsed_data?.languages || [],
    },
    projects: (profile?.resume_parsed_data?.projects || []).map((proj) => ({
      name: proj.title,
      date: '',
      url: '',
      technologies: [],
      bullets: proj.description ? [proj.description] : [],
    })),
    certifications: (profile?.resume_parsed_data?.certifications || []).map((cert) => ({
      name: cert,
      issuer: '',
      date: '',
    })),
  };

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ResumeBuilder initialProfile={initialProfile} />
    </div>
  );
}
