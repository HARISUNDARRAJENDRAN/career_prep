'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { User, Bot } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HumeMessage = any;

interface InterviewTranscriptProps {
  messages: HumeMessage[];
}

/**
 * Displays the real-time transcript of the interview conversation.
 */
export function InterviewTranscript({ messages }: InterviewTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredMessages = messages.filter(
    (m) => m.type === 'user_message' || m.type === 'assistant_message'
  );

  return (
    <Card className="h-[500px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Transcript</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[420px] px-6">
          <div className="space-y-4 pb-4" ref={scrollRef}>
            {filteredMessages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                The conversation will appear here...
              </p>
            ) : (
              filteredMessages.map((msg, index) => {
                const isUser = msg.type === 'user_message';
                const content = msg.message?.content || '';
                const topEmotion = isUser
                  ? getTopEmotion(msg.models?.prosody?.scores)
                  : null;

                return (
                  <div
                    key={index}
                    className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isUser ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      {isUser ? (
                        <User className="h-4 w-4 text-primary-foreground" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={`flex-1 space-y-1 ${isUser ? 'text-right' : ''}`}
                    >
                      <div
                        className={`flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}
                      >
                        <span className="text-sm font-medium">
                          {isUser ? 'You' : 'Interviewer'}
                        </span>
                        {topEmotion && (
                          <Badge variant="outline" className="text-xs">
                            {topEmotion}
                          </Badge>
                        )}
                      </div>
                      <p
                        className={`rounded-lg p-3 text-sm ${
                          isUser
                            ? 'bg-primary text-primary-foreground ml-8'
                            : 'bg-muted mr-8'
                        }`}
                      >
                        {content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function getTopEmotion(scores?: Record<string, number>): string | null {
  if (!scores) return null;

  const entries = Object.entries(scores);
  if (entries.length === 0) return null;

  const [topEmotion] = entries.sort(([, a], [, b]) => b - a)[0];
  return topEmotion;
}
