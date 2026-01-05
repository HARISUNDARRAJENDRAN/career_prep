'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Target,
  CheckCircle2,
  Loader2,
  Sparkles,
  TrendingUp,
  Route,
  FileSearch,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'in_progress' | 'completed';
}

interface AgentProcessingProps {
  title?: string;
  subtitle?: string;
  steps?: ProcessingStep[];
  currentStep?: number;
  variant?: 'interview' | 'roadmap' | 'market';
  className?: string;
}

const defaultInterviewSteps: ProcessingStep[] = [
  {
    id: 'parsing',
    label: 'Parsing Transcript',
    description: 'Extracting conversation data',
    icon: <FileSearch className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'analyzing',
    label: 'Analyzing Skills',
    description: 'Evaluating demonstrated competencies',
    icon: <Brain className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'verifying',
    label: 'Verifying Proficiency',
    description: 'Comparing claimed vs demonstrated levels',
    icon: <Target className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'feedback',
    label: 'Generating Feedback',
    description: 'Creating personalized recommendations',
    icon: <Lightbulb className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'roadmap',
    label: 'Updating Roadmap',
    description: 'Adjusting your learning path',
    icon: <Route className="h-5 w-5" />,
    status: 'pending',
  },
];

const defaultRoadmapSteps: ProcessingStep[] = [
  {
    id: 'analyzing',
    label: 'Analyzing Skills',
    description: 'Reviewing your skill profile',
    icon: <Brain className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'market',
    label: 'Checking Market Trends',
    description: 'Analyzing current job market demand',
    icon: <TrendingUp className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'generating',
    label: 'Generating Roadmap',
    description: 'Creating personalized learning modules',
    icon: <Route className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'optimizing',
    label: 'Optimizing Path',
    description: 'Fine-tuning for maximum efficiency',
    icon: <Sparkles className="h-5 w-5" />,
    status: 'pending',
  },
];

const defaultMarketSteps: ProcessingStep[] = [
  {
    id: 'scraping',
    label: 'Scanning Job Boards',
    description: 'Fetching latest opportunities',
    icon: <FileSearch className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'analyzing',
    label: 'Analyzing Trends',
    description: 'Identifying skill demand patterns',
    icon: <TrendingUp className="h-5 w-5" />,
    status: 'pending',
  },
  {
    id: 'matching',
    label: 'Matching Opportunities',
    description: 'Finding jobs that fit your profile',
    icon: <Target className="h-5 w-5" />,
    status: 'pending',
  },
];

export function AgentProcessing({
  title = 'Processing Your Interview',
  subtitle = 'Our AI agents are analyzing your performance',
  steps,
  currentStep = 0,
  variant = 'interview',
  className,
}: AgentProcessingProps) {
  const [activeStep, setActiveStep] = useState(currentStep);
  const [displaySteps, setDisplaySteps] = useState<ProcessingStep[]>([]);

  // Initialize steps based on variant
  useEffect(() => {
    if (steps) {
      setDisplaySteps(steps);
    } else {
      switch (variant) {
        case 'roadmap':
          setDisplaySteps(defaultRoadmapSteps);
          break;
        case 'market':
          setDisplaySteps(defaultMarketSteps);
          break;
        default:
          setDisplaySteps(defaultInterviewSteps);
      }
    }
  }, [steps, variant]);

  // Auto-advance steps if no external control
  useEffect(() => {
    if (currentStep === 0 && displaySteps.length > 0) {
      const interval = setInterval(() => {
        setActiveStep((prev) => {
          if (prev >= displaySteps.length - 1) {
            return prev; // Stay at last step
          }
          return prev + 1;
        });
      }, 3000); // Advance every 3 seconds

      return () => clearInterval(interval);
    } else {
      setActiveStep(currentStep);
    }
  }, [currentStep, displaySteps.length]);

  // Update step statuses based on active step
  const stepsWithStatus = displaySteps.map((step, index) => ({
    ...step,
    status: (index < activeStep
      ? 'completed'
      : index === activeStep
        ? 'in_progress'
        : 'pending') as ProcessingStep['status'],
  }));

  return (
    <div className={cn('flex flex-col items-center justify-center min-h-[400px] p-8', className)}>
      {/* Animated Brain Icon */}
      <motion.div
        className="relative mb-8"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Brain className="h-10 w-10 text-primary" />
        </div>
        {/* Orbiting particles */}
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <Sparkles className="absolute -top-1 left-1/2 h-4 w-4 text-amber-500" />
        </motion.div>
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: -360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        >
          <Sparkles className="absolute top-1/2 -right-1 h-3 w-3 text-blue-500" />
        </motion.div>
      </motion.div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-center mb-2">{title}</h2>
      <p className="text-muted-foreground text-center mb-8 max-w-md">{subtitle}</p>

      {/* Steps */}
      <div className="w-full max-w-md space-y-3">
        <AnimatePresence mode="wait">
          {stepsWithStatus.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border transition-all duration-300',
                step.status === 'completed' && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
                step.status === 'in_progress' && 'bg-primary/5 border-primary/30 shadow-sm',
                step.status === 'pending' && 'bg-muted/30 border-transparent opacity-60'
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                  step.status === 'completed' && 'bg-green-500 text-white',
                  step.status === 'in_progress' && 'bg-primary text-primary-foreground',
                  step.status === 'pending' && 'bg-muted text-muted-foreground'
                )}
              >
                {step.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : step.status === 'in_progress' ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="h-5 w-5" />
                  </motion.div>
                ) : (
                  step.icon
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-medium',
                  step.status === 'completed' && 'text-green-700 dark:text-green-300',
                  step.status === 'in_progress' && 'text-primary',
                  step.status === 'pending' && 'text-muted-foreground'
                )}>
                  {step.label}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>

              {/* Status indicator */}
              {step.status === 'in_progress' && (
                <motion.div
                  className="h-2 w-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Bottom message */}
      <motion.p
        className="mt-8 text-sm text-muted-foreground text-center"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        This may take a minute or two. Please don&apos;t close this page.
      </motion.p>
    </div>
  );
}
