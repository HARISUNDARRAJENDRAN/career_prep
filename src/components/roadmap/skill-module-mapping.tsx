'use client';

import { motion, type Variants } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  ArrowDown,
  BookOpen,
  CheckCircle2,
  Target,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { SkillGapCardData } from './skill-gap-cards';

type ModuleData = {
  id: string;
  title: string;
  description: string | null;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  skillId: string | null;
  estimatedHours: number | null;
  isMilestone: boolean;
};

type Props = {
  gapSkills: SkillGapCardData[];
  modules: ModuleData[];
};

// Animation variants with proper typing
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

const gapCardVariants: Variants = {
  hidden: { opacity: 0, x: -20, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

const moduleCardVariants: Variants = {
  hidden: { opacity: 0, x: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

const arrowVariants: Variants = {
  hidden: { opacity: 0, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
      delay: 0.1,
    },
  },
};

const progressVariants: Variants = {
  hidden: { opacity: 0, scaleX: 0 },
  visible: {
    opacity: 1,
    scaleX: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 20,
      delay: 0.3,
    },
  },
};

export function SkillModuleMapping({ gapSkills, modules }: Props) {
  // Create mapping of skill gaps to their targeting modules
  const skillToModules = new Map<string, ModuleData[]>();

  gapSkills.forEach((skill) => {
    const targetingModules = modules.filter((m) => m.skillId === skill.skillId);
    if (targetingModules.length > 0) {
      skillToModules.set(skill.skillId, targetingModules);
    }
  });

  // Skills without targeting modules
  const unmappedGaps = gapSkills.filter(
    (skill) => !skillToModules.has(skill.skillId)
  );

  // Calculate stats
  const totalGaps = gapSkills.length;
  const coveredGaps = skillToModules.size;
  const coveragePercent = totalGaps > 0 ? (coveredGaps / totalGaps) * 100 : 0;

  if (gapSkills.length === 0) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <Card className="border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          <CardHeader>
            <motion.div variants={itemVariants} className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 3,
                }}
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </motion.div>
              <CardTitle className="text-lg">All Skills Aligned</CardTitle>
            </motion.div>
            <motion.div variants={itemVariants}>
              <CardDescription>
                Your verified skills match your claimed proficiency levels. Keep up the great work!
              </CardDescription>
            </motion.div>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  const getStatusColor = (status: ModuleData['status']) => {
    switch (status) {
      case 'completed':
        return 'text-emerald-500';
      case 'in_progress':
        return 'text-blue-500';
      case 'available':
        return 'text-amber-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusBadge = (status: ModuleData['status']) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">
            Completed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20">
            In Progress
          </Badge>
        );
      case 'available':
        return (
          <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">
            Available
          </Badge>
        );
      default:
        return <Badge variant="outline">Locked</Badge>;
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <motion.div variants={itemVariants} className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            <CardTitle className="text-lg">Skill Gap Coverage</CardTitle>
          </motion.div>
          <motion.div variants={itemVariants}>
            <CardDescription>
              Learning modules targeting your identified skill gaps
            </CardDescription>
          </motion.div>
          {/* Coverage stats */}
          <motion.div variants={progressVariants} className="pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gap Coverage</span>
              <motion.span
                className="font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {coveredGaps}/{totalGaps} gaps addressed
              </motion.span>
            </div>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
              style={{ transformOrigin: 'left' }}
            >
              <Progress value={coveragePercent} className="h-2" />
            </motion.div>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mapped skill gaps */}
          {Array.from(skillToModules.entries()).map(([skillId, targetModules], index) => {
            const skill = gapSkills.find((s) => s.skillId === skillId)!;
            return (
              <motion.div
                key={skillId}
                variants={containerVariants}
                custom={index}
                className="space-y-3"
              >
                {/* Skill gap card */}
                <motion.div
                  variants={gapCardVariants}
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-orange-500/5 border border-orange-500/20"
                >
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatDelay: 2,
                    }}
                  >
                    <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{skill.name}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-blue-500">{skill.claimedLevel}</span>
                      {' → '}
                      <span className="text-orange-500">{skill.verifiedLevel || 'Unverified'}</span>
                    </p>
                  </div>
                  {skill.category && (
                    <Badge variant="outline" className="shrink-0">
                      {skill.category}
                    </Badge>
                  )}
                </motion.div>

                {/* Arrow connection */}
                <motion.div
                  variants={arrowVariants}
                  className="flex justify-center"
                >
                  <motion.div
                    animate={{ y: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowDown className="h-5 w-5 text-muted-foreground/50" />
                  </motion.div>
                </motion.div>

                {/* Targeting modules */}
                <motion.div
                  variants={containerVariants}
                  className="grid gap-2 pl-4 border-l-2 border-primary/20"
                >
                  {targetModules.map((module, moduleIndex) => (
                    <motion.div
                      key={module.id}
                      variants={moduleCardVariants}
                      custom={moduleIndex}
                      whileHover={{ scale: 1.01, x: 4 }}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        module.status === 'completed'
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : module.status === 'in_progress'
                            ? 'bg-blue-500/5 border-blue-500/20'
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <motion.div
                        whileHover={{ rotate: 15 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                      >
                        <BookOpen className={`h-4 w-4 shrink-0 ${getStatusColor(module.status)}`} />
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{module.title}</p>
                        {module.estimatedHours && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {module.estimatedHours}h estimated
                          </p>
                        )}
                      </div>
                      {getStatusBadge(module.status)}
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            );
          })}

          {/* Unmapped skill gaps */}
          {unmappedGaps.length > 0 && (
            <motion.div variants={itemVariants} className="pt-4 border-t">
              <motion.p
                variants={itemVariants}
                className="text-sm font-medium mb-3 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4 text-amber-500" />
                Skill Gaps Without Modules
              </motion.p>
              <motion.div variants={containerVariants} className="flex flex-wrap gap-2">
                {unmappedGaps.map((skill, index) => (
                  <motion.div
                    key={skill.id}
                    variants={itemVariants}
                    custom={index}
                    whileHover={{ scale: 1.05 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border"
                  >
                    <span className="text-sm">{skill.name}</span>
                    {skill.category && (
                      <Badge variant="outline" className="text-xs py-0">
                        {skill.category}
                      </Badge>
                    )}
                  </motion.div>
                ))}
              </motion.div>
              <motion.p
                variants={itemVariants}
                className="text-xs text-muted-foreground mt-3 flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3" />
                The Architect Agent will add modules for these gaps in your next roadmap update.
              </motion.p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
