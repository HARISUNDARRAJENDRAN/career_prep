import { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AgentControlRoom } from '@/components/agent-control/agent-control-room';

export const metadata: Metadata = {
  title: 'Agent Control Room | Career Prep',
  description: 'Monitor and control your autonomous career agents',
};

export default async function AgentRequestsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Agent Control Room</h1>
        <p className="text-muted-foreground">
          Monitor your autonomous career agents, review pending actions, and track their performance.
        </p>
      </div>

      <AgentControlRoom userId={userId} />
    </div>
  );
}
