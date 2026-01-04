'use client';

import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Lightbulb,
  MessageSquareQuote,
  Sparkles,
  TrendingUp,
  Target,
} from 'lucide-react';

// Types for the component
export type SkillGapCardData = {
  id: string;
  skillId: string;
  name: string;
  category: string | null;
  claimedLevel: string;
  verifiedLevel: string | null;
  gapIdentified: boolean;
  isVerified: boolean;
  demandScore: number | null;
  // Verification proof
  latestProof?: {
    interviewId: string;
    timestamp: string;
    transcriptSnippet: string;
    evaluatorConfidence: number;
  };
  // Recommendations
  recommendations?: string[];
  // Improvement history
  improvementHistory?: Array<{
    from: string;
    to: string;
    date: string;
    interviewId: string;
  }>;
  // Linked learning module
  linkedModule?: {
    id: string;
    title: string;
    description: string | null;
    status: 'locked' | 'available' | 'in_progress' | 'completed';
    estimatedHours: number | null;
    resources?: Array<{
      title: string;
      url: string;
      type: 'video' | 'article' | 'course' | 'project';
    }>;
  };
};

type Props = {
  skills: SkillGapCardData[];
};

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

const expandVariants: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 20,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Helper to get demand level
function getDemandLevel(score: number | null): { label: string; color: string; bgColor: string } {
  if (!score) return { label: 'Unknown', color: 'text-muted-foreground', bgColor: 'bg-muted' };
  if (score >= 7) return { label: 'High Demand', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' };
  if (score >= 4) return { label: 'Medium Demand', color: 'text-amber-500', bgColor: 'bg-amber-500/10' };
  return { label: 'Low Demand', color: 'text-muted-foreground', bgColor: 'bg-muted' };
}

// Helper to get gap severity
function getGapSeverity(claimed: string, verified: string | null): { level: number; label: string; color: string } {
  if (!verified) return { level: 0, label: 'Unverified', color: 'text-muted-foreground' };

  const levels = ['learning', 'practicing', 'proficient', 'expert'];
  const claimedIdx = levels.indexOf(claimed);
  const verifiedIdx = levels.indexOf(verified);
  const diff = claimedIdx - verifiedIdx;

  if (diff <= 0) return { level: 0, label: 'Aligned', color: 'text-emerald-500' };
  if (diff === 1) return { level: 1, label: 'Minor Gap', color: 'text-amber-500' };
  if (diff === 2) return { level: 2, label: 'Moderate Gap', color: 'text-orange-500' };
  return { level: 3, label: 'Major Gap', color: 'text-red-500' };
}

// Format level for display
function formatLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

// Single Skill Gap Card
function SkillGapCard({ skill }: { skill: SkillGapCardData }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const demand = getDemandLevel(skill.demandScore);
  const gap = getGapSeverity(skill.claimedLevel, skill.verifiedLevel);
  const hasDetails = skill.latestProof || skill.recommendations?.length || skill.linkedModule;

  return (
    <motion.div variants={cardVariants}>
      <Card className={`overflow-hidden transition-shadow hover:shadow-md ${
        skill.gapIdentified ? 'border-orange-500/30' : skill.isVerified ? 'border-emerald-500/30' : ''
      }`}>
        {/* Header - Always visible */}
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">{skill.name}</CardTitle>
                {skill.category && (
                  <Badge variant="outline" className="text-xs">
                    {skill.category}
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-medium">{formatLevel(skill.claimedLevel)}</span>
                <ArrowRight className="h-3 w-3" />
                <span className={`font-medium ${gap.color}`}>
                  {skill.verifiedLevel ? formatLevel(skill.verifiedLevel) : 'Not Verified'}
                </span>
                {skill.gapIdentified && (
                  <Badge variant="secondary" className={`gap-1 ${gap.color}`}>
                    <AlertTriangle className="h-3 w-3" />
                    {gap.label}
                  </Badge>
                )}
                {skill.isVerified && !skill.gapIdentified && (
                  <Badge variant="secondary" className="gap-1 text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </CardDescription>
            </div>
            {/* Demand Badge */}
            <Badge className={`shrink-0 ${demand.bgColor} ${demand.color} border-0`}>
              {demand.label}
            </Badge>
          </div>

          {/* Confidence indicator */}
          {skill.latestProof && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Verification Confidence</span>
                <span>{Math.round(skill.latestProof.evaluatorConfidence * 100)}%</span>
              </div>
              <Progress value={skill.latestProof.evaluatorConfidence * 100} className="h-1.5" />
            </div>
          )}
        </CardHeader>

        {/* Expandable Content */}
        {hasDetails && (
          <>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  variants={expandVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <CardContent className="pt-0 space-y-4">
                    {/* Interview Evidence */}
                    {skill.latestProof?.transcriptSnippet && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <MessageSquareQuote className="h-4 w-4 text-blue-500" />
                          Interview Evidence
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-sm italic text-muted-foreground border-l-2 border-blue-500">
                          &ldquo;{skill.latestProof.transcriptSnippet}&rdquo;
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {skill.recommendations && skill.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          Recommendations
                        </div>
                        <ul className="space-y-1.5">
                          {skill.recommendations.map((rec, idx) => (
                            <motion.li
                              key={idx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <Sparkles className="h-3 w-3 mt-1 text-amber-500 shrink-0" />
                              {rec}
                            </motion.li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Linked Learning Module */}
                    {skill.linkedModule && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <BookOpen className="h-4 w-4 text-violet-500" />
                          Learning Module
                        </div>
                        <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">{skill.linkedModule.title}</p>
                              {skill.linkedModule.estimatedHours && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <Clock className="h-3 w-3" />
                                  {skill.linkedModule.estimatedHours} hours estimated
                                </p>
                              )}
                            </div>
                            <Badge variant={
                              skill.linkedModule.status === 'completed' ? 'default' :
                              skill.linkedModule.status === 'in_progress' ? 'secondary' : 'outline'
                            } className="text-xs shrink-0">
                              {skill.linkedModule.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          {/* Resources */}
                          {skill.linkedModule.resources && skill.linkedModule.resources.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-violet-500/10">
                              <p className="text-xs text-muted-foreground mb-2">Resources:</p>
                              <div className="flex flex-wrap gap-2">
                                {skill.linkedModule.resources.slice(0, 3).map((resource, idx) => (
                                  <a
                                    key={idx}
                                    href={resource.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-violet-500 hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    {resource.title}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Improvement History */}
                    {skill.improvementHistory && skill.improvementHistory.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                          Progress History
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {skill.improvementHistory.map((h, idx) => (
                            <Badge key={idx} variant="outline" className="gap-1 text-xs">
                              {formatLevel(h.from)} → {formatLevel(h.to)}
                              <span className="text-muted-foreground">
                                ({new Date(h.date).toLocaleDateString()})
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Expand/Collapse Button */}
            <div className="px-6 pb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full justify-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    View Details
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}

export function SkillGapCards({ skills }: Props) {
  // Separate gap skills from verified skills
  const gapSkills = skills.filter(s => s.gapIdentified);
  const verifiedSkills = skills.filter(s => s.isVerified && !s.gapIdentified);
  const unverifiedSkills = skills.filter(s => !s.isVerified);

  // Sort gap skills by severity
  const sortedGapSkills = [...gapSkills].sort((a, b) => {
    const aSeverity = getGapSeverity(a.claimedLevel, a.verifiedLevel).level;
    const bSeverity = getGapSeverity(b.claimedLevel, b.verifiedLevel).level;
    return bSeverity - aSeverity;
  });

  if (skills.length === 0) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <Target className="h-10 w-10 text-muted-foreground mb-2" />
          <CardTitle>No Skills to Display</CardTitle>
          <CardDescription>
            Complete your Reality Check Interview to see your skill analysis.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Stats
  const totalSkills = skills.length;
  const totalGaps = gapSkills.length;
  const totalVerified = verifiedSkills.length;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* Summary Stats */}
      <motion.div variants={cardVariants} className="grid grid-cols-3 gap-4">
        <Card className="bg-orange-500/5 border-orange-500/20">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{totalGaps}</p>
            <p className="text-xs text-muted-foreground">Skill Gaps</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{totalVerified}</p>
            <p className="text-xs text-muted-foreground">Verified & Aligned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold">{totalSkills}</p>
            <p className="text-xs text-muted-foreground">Total Skills</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gap Skills Section */}
      {sortedGapSkills.length > 0 && (
        <div className="space-y-3">
          <motion.h3 variants={cardVariants} className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Skill Gaps to Address ({sortedGapSkills.length})
          </motion.h3>
          <div className="grid gap-4 md:grid-cols-2">
            {sortedGapSkills.map(skill => (
              <SkillGapCard key={skill.id} skill={skill} />
            ))}
          </div>
        </div>
      )}

      {/* Verified Skills Section */}
      {verifiedSkills.length > 0 && (
        <div className="space-y-3">
          <motion.h3 variants={cardVariants} className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Verified Skills ({verifiedSkills.length})
          </motion.h3>
          <div className="grid gap-4 md:grid-cols-2">
            {verifiedSkills.map(skill => (
              <SkillGapCard key={skill.id} skill={skill} />
            ))}
          </div>
        </div>
      )}

      {/* Unverified Skills Section */}
      {unverifiedSkills.length > 0 && (
        <div className="space-y-3">
          <motion.h3 variants={cardVariants} className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            Pending Verification ({unverifiedSkills.length})
          </motion.h3>
          <div className="grid gap-4 md:grid-cols-2">
            {unverifiedSkills.map(skill => (
              <SkillGapCard key={skill.id} skill={skill} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
