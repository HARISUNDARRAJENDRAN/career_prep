'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

type Insight = {
  id: string;
  category: 'tip' | 'motivation' | 'fact';
  title: string;
  content: string;
};

type Props = {
  insights?: Insight[];
  hasCompletedInterview?: boolean;
  skillGapsCount?: number;
};

const defaultInsights: Insight[] = [
  {
    id: '1',
    category: 'tip',
    title: 'Practice Makes Perfect',
    content: 'Candidates who complete weekly practice interviews are 3x more likely to succeed in real interviews. Consistency builds confidence!',
  },
  {
    id: '2',
    category: 'motivation',
    title: 'You\'re Making Progress',
    content: 'Every skill gap you identify is a step toward improvement. Focus on one skill at a time for maximum impact.',
  },
  {
    id: '3',
    category: 'fact',
    title: 'Market Insight',
    content: 'Employers value verified skills over self-reported ones. Your Reality Check interview provides authentic proof of your abilities.',
  },
  {
    id: '4',
    category: 'tip',
    title: 'Stand Out Strategy',
    content: 'Tailoring your application to each job\'s requirements can increase your callback rate by up to 50%.',
  },
  {
    id: '5',
    category: 'motivation',
    title: 'Growth Mindset',
    content: 'The most successful professionals never stop learning. Your dedication to improvement sets you apart from the crowd.',
  },
];

function getCategoryStyle(category: Insight['category']) {
  switch (category) {
    case 'tip':
      return { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Pro Tip' };
    case 'motivation':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'Motivation' };
    case 'fact':
      return { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Did You Know?' };
  }
}

export function CareerInsights({ insights = defaultInsights, hasCompletedInterview, skillGapsCount }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  // Add contextual insights based on user state
  const contextualInsights = [...insights];

  if (!hasCompletedInterview) {
    contextualInsights.unshift({
      id: 'contextual-1',
      category: 'tip',
      title: 'Get Started Today',
      content: 'Complete your Reality Check interview to unlock personalized learning paths and verified skill badges.',
    });
  }

  if (skillGapsCount && skillGapsCount > 0) {
    contextualInsights.unshift({
      id: 'contextual-2',
      category: 'motivation',
      title: 'Turn Gaps Into Strengths',
      content: `You have ${skillGapsCount} skill gap${skillGapsCount > 1 ? 's' : ''} to work on. Focus on the highest-demand skills first for maximum career impact.`,
    });
  }

  const currentInsight = contextualInsights[currentIndex];
  const style = getCategoryStyle(currentInsight.category);

  useEffect(() => {
    if (!autoPlay) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % contextualInsights.length);
    }, 8000);

    return () => clearInterval(timer);
  }, [autoPlay, contextualInsights.length]);

  const goToPrev = () => {
    setAutoPlay(false);
    setCurrentIndex((prev) => (prev - 1 + contextualInsights.length) % contextualInsights.length);
  };

  const goToNext = () => {
    setAutoPlay(false);
    setCurrentIndex((prev) => (prev + 1) % contextualInsights.length);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          Career Insights
        </CardTitle>
        <CardDescription>Tips and motivation for your journey</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative min-h-[140px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentInsight.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-3"
            >
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                <Lightbulb className="h-3 w-3" />
                {style.label}
              </div>
              <h4 className="font-medium">{currentInsight.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {currentInsight.content}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <div className="flex gap-1">
            {contextualInsights.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setAutoPlay(false);
                  setCurrentIndex(idx);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
