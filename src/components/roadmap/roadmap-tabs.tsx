'use client';

import { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, BarChart3 } from 'lucide-react';

type Props = {
  learningPathContent: ReactNode;
  skillAnalysisContent: ReactNode;
  hasSkillData: boolean;
};

export function RoadmapTabs({ learningPathContent, skillAnalysisContent, hasSkillData }: Props) {
  return (
    <Tabs defaultValue="learning-path" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2 max-w-md">
        <TabsTrigger value="learning-path" className="gap-2">
          <BookOpen className="h-4 w-4" />
          Learning Path
        </TabsTrigger>
        <TabsTrigger value="skill-analysis" className="gap-2" disabled={!hasSkillData}>
          <BarChart3 className="h-4 w-4" />
          Skill Analysis
        </TabsTrigger>
      </TabsList>

      <TabsContent value="learning-path" className="space-y-4 mt-6">
        {learningPathContent}
      </TabsContent>

      <TabsContent value="skill-analysis" className="space-y-6 mt-6">
        {skillAnalysisContent}
      </TabsContent>
    </Tabs>
  );
}
