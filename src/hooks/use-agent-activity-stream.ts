/**
 * useAgentActivityStream Hook
 *
 * React hook for connecting to the Agent Activity SSE stream.
 * Provides real-time updates for agent activities, directives,
 * and application submissions.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// Event types from the SSE stream
export type AgentEventType =
  | 'sprint_started'
  | 'sprint_progress'
  | 'sprint_complete'
  | 'directive_issued'
  | 'directive_completed'
  | 'application_submitted'
  | 'application_draft_created'
  | 'ghosting_detected'
  | 'rejection_analyzed'
  | 'approval_needed'
  | 'resume_updated'
  | 'agent_status_changed'
  | 'connected'
  | 'initial_state'
  | 'heartbeat';

export interface AgentStreamEvent {
  type: AgentEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface InitialState {
  active_directives: number;
  applications_today: number;
  pending_approvals: number;
  last_directive: {
    id: string;
    type: string;
    title: string;
    status: string;
    issued_at: string;
  } | null;
  timestamp: string;
}

export interface SprintProgressData {
  phase: string;
  progress: number;
  message: string;
}

export interface SprintCompleteData {
  applications_created: number;
  health_score: number;
  directives_issued: number;
}

export interface DirectiveIssuedData {
  id: string;
  type: string;
  title: string;
  priority: string;
}

export interface ApplicationSubmittedData {
  id: string;
  company: string;
  role: string;
  status: string;
  auto_submitted: boolean;
}

export interface AgentStatusChangedData {
  agent_id: string;
  status: 'idle' | 'running' | 'error';
  message?: string;
}

interface UseAgentActivityStreamOptions {
  onEvent?: (event: AgentStreamEvent) => void;
  onInitialState?: (state: InitialState) => void;
  onSprintProgress?: (data: SprintProgressData) => void;
  onSprintComplete?: (data: SprintCompleteData) => void;
  onDirectiveIssued?: (data: DirectiveIssuedData) => void;
  onApplicationSubmitted?: (data: ApplicationSubmittedData) => void;
  onAgentStatusChanged?: (data: AgentStatusChangedData) => void;
  onApprovalNeeded?: (count: number) => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

interface UseAgentActivityStreamReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  lastEvent: AgentStreamEvent | null;
  initialState: InitialState | null;
  sprintProgress: SprintProgressData | null;
  connect: () => void;
  disconnect: () => void;
}

export function useAgentActivityStream(
  options: UseAgentActivityStreamOptions = {}
): UseAgentActivityStreamReturn {
  const {
    onEvent,
    onInitialState,
    onSprintProgress,
    onSprintComplete,
    onDirectiveIssued,
    onApplicationSubmitted,
    onAgentStatusChanged,
    onApprovalNeeded,
    onError,
    autoReconnect = true,
    reconnectDelay = 5000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastEvent, setLastEvent] = useState<AgentStreamEvent | null>(null);
  const [initialState, setInitialState] = useState<InitialState | null>(null);
  const [sprintProgress, setSprintProgress] = useState<SprintProgressData | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const handleEvent = useCallback(
    (type: AgentEventType, data: Record<string, unknown>) => {
      const event: AgentStreamEvent = {
        type,
        data,
        timestamp: (data.timestamp as string) || new Date().toISOString(),
      };

      if (!isMountedRef.current) return;

      setLastEvent(event);
      onEvent?.(event);

      // Handle specific event types
      switch (type) {
        case 'initial_state':
          setInitialState(data as unknown as InitialState);
          onInitialState?.(data as unknown as InitialState);
          break;

        case 'sprint_progress':
          setSprintProgress(data as unknown as SprintProgressData);
          onSprintProgress?.(data as unknown as SprintProgressData);
          break;

        case 'sprint_complete':
          setSprintProgress(null);
          onSprintComplete?.(data as unknown as SprintCompleteData);
          break;

        case 'directive_issued':
          onDirectiveIssued?.(data as unknown as DirectiveIssuedData);
          break;

        case 'application_submitted':
        case 'application_draft_created':
          onApplicationSubmitted?.(data as unknown as ApplicationSubmittedData);
          break;

        case 'agent_status_changed':
          onAgentStatusChanged?.(data as unknown as AgentStatusChangedData);
          break;

        case 'approval_needed':
          onApprovalNeeded?.((data as unknown as { pending_count: number }).pending_count);
          break;
      }
    },
    [
      onEvent,
      onInitialState,
      onSprintProgress,
      onSprintComplete,
      onDirectiveIssued,
      onApplicationSubmitted,
      onAgentStatusChanged,
      onApprovalNeeded,
    ]
  );

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const eventSource = new EventSource('/api/agents/activity/stream');
      eventSourceRef.current = eventSource;

      // Generic message handler for specific event types
      const eventTypes: AgentEventType[] = [
        'connected',
        'initial_state',
        'heartbeat',
        'sprint_started',
        'sprint_progress',
        'sprint_complete',
        'directive_issued',
        'directive_completed',
        'application_submitted',
        'application_draft_created',
        'ghosting_detected',
        'rejection_analyzed',
        'approval_needed',
        'resume_updated',
        'agent_status_changed',
      ];

      eventTypes.forEach((eventType) => {
        eventSource.addEventListener(eventType, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handleEvent(eventType, data);
          } catch (parseError) {
            console.error(`[SSE] Failed to parse ${eventType} event:`, parseError);
          }
        });
      });

      eventSource.onopen = () => {
        if (!isMountedRef.current) return;
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        console.log('[SSE] Connected to agent activity stream');
      };

      eventSource.onerror = () => {
        if (!isMountedRef.current) return;

        setIsConnected(false);
        setIsConnecting(false);
        const err = new Error('SSE connection lost');
        setError(err);
        onError?.(err);

        // Close the current connection
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt to reconnect
        if (autoReconnect && isMountedRef.current) {
          console.log(`[SSE] Reconnecting in ${reconnectDelay}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect();
            }
          }, reconnectDelay);
        }
      };
    } catch (err) {
      setIsConnecting(false);
      const error = err instanceof Error ? err : new Error('Failed to connect to SSE');
      setError(error);
      onError?.(error);
    }
  }, [handleEvent, autoReconnect, reconnectDelay, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount/unmount

  return {
    isConnected,
    isConnecting,
    error,
    lastEvent,
    initialState,
    sprintProgress,
    connect,
    disconnect,
  };
}

export default useAgentActivityStream;
