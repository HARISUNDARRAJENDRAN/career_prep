'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Mic,
  FileText,
  Briefcase,
  BookOpen,
  Target,
  Plus,
  ArrowRight,
} from 'lucide-react';

type QuickAction = {
  id: string;
  label: string;
  description: string;
  icon: typeof Mic;
  href: string;
  color: string;
  bgColor: string;
};

type Props = {
  hasCompletedRealityCheck: boolean;
  hasSkills: boolean;
};

export function QuickActions({ hasCompletedRealityCheck, hasSkills }: Props) {
  const actions: QuickAction[] = [
    {
      id: 'interview',
      label: hasCompletedRealityCheck ? 'Weekly Sprint' : 'Reality Check',
      description: hasCompletedRealityCheck
        ? 'Continue your progress'
        : 'Start your first interview',
      icon: Mic,
      href: '/interviews/new',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    },
    {
      id: 'skills',
      label: hasSkills ? 'Manage Skills' : 'Add Skills',
      description: hasSkills ? 'View & update skills' : 'Start your profile',
      icon: hasSkills ? Target : Plus,
      href: '/skills',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10 hover:bg-blue-500/20',
    },
    {
      id: 'roadmap',
      label: 'My Roadmap',
      description: 'View learning path',
      icon: BookOpen,
      href: '/roadmap',
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10 hover:bg-violet-500/20',
    },
    {
      id: 'jobs',
      label: 'Browse Jobs',
      description: 'Find opportunities',
      icon: Briefcase,
      href: '/jobs',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10 hover:bg-amber-500/20',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 100 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      {actions.map((action, index) => (
        <motion.div
          key={action.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 + index * 0.1 }}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <Link href={action.href}>
            <div
              className={`rounded-xl p-4 ${action.bgColor} transition-all duration-200 cursor-pointer group h-full`}
            >
              <div className="flex items-start justify-between mb-2">
                <motion.div
                  whileHover={{ rotate: 10 }}
                  className={`p-2 rounded-lg bg-background/50`}
                >
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                </motion.div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="font-medium text-sm">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
