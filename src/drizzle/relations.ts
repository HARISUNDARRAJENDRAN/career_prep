import { relations } from 'drizzle-orm';
import { users } from './schema/user';
import { userProfiles } from './schema/user-profiles';
import { interviews } from './schema/interviews';
import { skills, userSkills, skillVerifications } from './schema/skills';
import { roadmaps, roadmapModules } from './schema/roadmaps';
import { jobApplications, applicationDocuments } from './schema/jobs';
import { jobListings, marketInsights, applicationFeedback } from './schema/market';

// User relations
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.clerk_id],
    references: [userProfiles.user_id],
  }),
  interviews: many(interviews),
  roadmaps: many(roadmaps),
  skills: many(userSkills),
  applications: many(jobApplications),
}));

// User Profile relations
export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.user_id],
    references: [users.clerk_id],
  }),
}));

// Interview relations
export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  user: one(users, {
    fields: [interviews.user_id],
    references: [users.clerk_id],
  }),
  skillVerifications: many(skillVerifications),
}));

// Skills catalog relations
export const skillsRelations = relations(skills, ({ many }) => ({
  userSkills: many(userSkills),
}));

// User Skills relations
export const userSkillsRelations = relations(userSkills, ({ one, many }) => ({
  user: one(users, {
    fields: [userSkills.user_id],
    references: [users.clerk_id],
  }),
  skill: one(skills, {
    fields: [userSkills.skill_id],
    references: [skills.id],
  }),
  verifications: many(skillVerifications),
}));

// Skill Verifications relations
export const skillVerificationsRelations = relations(skillVerifications, ({ one }) => ({
  userSkill: one(userSkills, {
    fields: [skillVerifications.user_skill_id],
    references: [userSkills.id],
  }),
  interview: one(interviews, {
    fields: [skillVerifications.interview_id],
    references: [interviews.id],
  }),
}));

// Roadmap relations
export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  user: one(users, {
    fields: [roadmaps.user_id],
    references: [users.clerk_id],
  }),
  modules: many(roadmapModules),
}));

// Roadmap Modules relations
export const roadmapModulesRelations = relations(roadmapModules, ({ one }) => ({
  roadmap: one(roadmaps, {
    fields: [roadmapModules.roadmap_id],
    references: [roadmaps.id],
  }),
  skill: one(skills, {
    fields: [roadmapModules.skill_id],
    references: [skills.id],
  }),
}));

// Job Applications relations
export const jobApplicationsRelations = relations(jobApplications, ({ one, many }) => ({
  user: one(users, {
    fields: [jobApplications.user_id],
    references: [users.clerk_id],
  }),
  jobListing: one(jobListings, {
    fields: [jobApplications.job_listing_id],
    references: [jobListings.id],
  }),
  document: one(applicationDocuments, {
    fields: [jobApplications.document_id],
    references: [applicationDocuments.id],
  }),
  feedback: many(applicationFeedback),
}));

// Application Documents relations
export const applicationDocumentsRelations = relations(applicationDocuments, ({ one }) => ({
  user: one(users, {
    fields: [applicationDocuments.user_id],
    references: [users.clerk_id],
  }),
}));

// Job Listings relations
export const jobListingsRelations = relations(jobListings, ({ many }) => ({
  applications: many(jobApplications),
}));

// Application Feedback relations
export const applicationFeedbackRelations = relations(applicationFeedback, ({ one }) => ({
  application: one(jobApplications, {
    fields: [applicationFeedback.job_application_id],
    references: [jobApplications.id],
  }),
}));
