# Agentic Architecture Overview

> **Document Version:** 1.0
> **Created:** January 5, 2026
> **Purpose:** Master plan for transforming Career Prep from reactive event handlers to truly autonomous agents

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Target State: True Autonomy](#target-state-true-autonomy)
3. [Architectural Changes Required](#architectural-changes-required)
4. [Implementation Phases](#implementation-phases)
5. [File Structure Changes](#file-structure-changes)
6. [Integration Strategy](#integration-strategy)
7. [Risk Assessment](#risk-assessment)

---

## Current State Analysis

### What We Have Today

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE                          │
│                    (Reactive Event Handlers)                     │
│                                                                  │
│  ┌─────────┐     ┌──────────────┐     ┌─────────────────────┐  │
│  │ Trigger │────►│ Message Bus  │────►│ Background Job      │  │
│  │ (Event) │     │ (Dispatch)   │     │ (Single Execution)  │  │
│  └─────────┘     └──────────────┘     └─────────────────────┘  │
│                                                                  │
│  Problems:                                                       │
│  • Jobs run once per trigger, no iteration                      │
│  • No reasoning about WHAT to do, just HOW to do it             │
│  • No memory between executions                                  │
│  • Hard-coded tool usage                                         │
│  • Linear execution, no dynamic planning                         │
└─────────────────────────────────────────────────────────────────┘
```

### Current Agent Implementation Pattern

```typescript
// Current Pattern: Reactive Job Handler
export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload) => {
    // 1. Receive event
    // 2. Execute predefined logic
    // 3. Return result
    // 4. Done - no iteration, no reasoning
    
    const analysis = await analyzeTranscript(payload);
    return analysis; // Single pass, always
  },
});
```

### Existing Components to Preserve

| Component | Location | Status | Integration Notes |
|-----------|----------|--------|-------------------|
| Message Bus | `src/lib/agents/message-bus.ts` | ✅ Keep | Add reasoning layer on top |
| Event Types | `src/lib/agents/events.ts` | ✅ Keep | Add new event types for agents |
| Trigger Jobs | `src/trigger/jobs/` | ⚠️ Refactor | Wrap with reasoning loops |
| Agent Events Table | `src/drizzle/schema/agent-events.ts` | ✅ Keep | Add agent_memory table |
| Idempotency | `shouldSkipEvent()` | ✅ Keep | Essential for loops |

---

## Target State: True Autonomy

### The Autonomous Agent Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      TARGET ARCHITECTURE                                  │
│                    (Autonomous Reasoning Agents)                          │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     AGENT COORDINATOR                                │ │
│  │  • Orchestrates multi-agent workflows                                │ │
│  │  • Manages agent states and transitions                              │ │
│  │  • Handles inter-agent communication                                 │ │
│  └───────────────────────────────┬─────────────────────────────────────┘ │
│                                  │                                        │
│  ┌───────────────────────────────▼─────────────────────────────────────┐ │
│  │                      REASONING LAYER                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │ │
│  │  │   Planner   │  │  Reasoner   │  │  Evaluator  │                  │ │
│  │  │   Agent     │  │   Agent     │  │   Agent     │                  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │ │
│  │         │                │                │                          │ │
│  │         └────────────────┴────────────────┘                          │ │
│  │                          │                                           │ │
│  └──────────────────────────┼───────────────────────────────────────────┘ │
│                             │                                             │
│  ┌──────────────────────────▼───────────────────────────────────────────┐ │
│  │                      EXECUTION LAYER                                  │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │ │
│  │  │ Interviewer │  │  Sentinel   │  │  Architect  │  │   Action    │ │ │
│  │  │   Agent     │  │   Agent     │  │   Agent     │  │   Agent     │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                             │                                             │
│  ┌──────────────────────────▼───────────────────────────────────────────┐ │
│  │                      TOOL LAYER                                       │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │ │
│  │  │   RAG   │  │   API   │  │   AI    │  │  Email  │  │   DB    │   │ │
│  │  │ Search  │  │ Clients │  │ Models  │  │ Parser  │  │ Queries │   │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                             │                                             │
│  ┌──────────────────────────▼───────────────────────────────────────────┐ │
│  │                      MEMORY LAYER                                     │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │ │
│  │  │ Working Memory  │  │ Episodic Memory │  │ Long-term Memory│      │ │
│  │  │ (Current Task)  │  │ (Past Actions)  │  │ (Learned Facts) │      │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Differences from Current State

| Aspect | Current (Reactive) | Target (Autonomous) |
|--------|-------------------|---------------------|
| **Decision Making** | Rule-based if/else | AI reasoning with goals |
| **Execution** | Single pass | Iterative until satisfied |
| **Memory** | None between runs | Working + episodic + long-term |
| **Tool Usage** | Hard-coded | Dynamic selection based on goal |
| **Planning** | None | Multi-step plan generation |
| **Coordination** | Event dispatch | Orchestrated workflows |
| **Self-Assessment** | None | Confidence scoring + validation |

---

## Architectural Changes Required

### 1. New Database Tables

```typescript
// agent_memory - Knowledge accumulation
// agent_plans - Active plans and sub-tasks
// agent_states - State machine tracking
// agent_tool_usage - Tool selection history
```

### 2. New Core Components

```
src/lib/agents/
├── core/
│   ├── base-agent.ts         # Abstract autonomous agent class
│   ├── agent-state.ts        # State machine implementation
│   ├── agent-memory.ts       # Memory management
│   ├── agent-planner.ts      # Planning/reasoning
│   └── agent-coordinator.ts  # Multi-agent orchestration
├── tools/
│   ├── tool-registry.ts      # Available tools catalog
│   ├── tool-selector.ts      # AI-based tool selection
│   └── tool-executor.ts      # Safe tool execution
├── reasoning/
│   ├── goal-decomposer.ts    # Break goals into sub-goals
│   ├── plan-generator.ts     # Generate action plans
│   ├── confidence-scorer.ts  # Evaluate output quality
│   └── iteration-controller.ts # Loop control logic
└── events.ts                 # (existing, extended)
└── message-bus.ts            # (existing, extended)
```

### 3. Refactored Trigger Jobs

```
src/trigger/jobs/
├── agents/                   # NEW: Autonomous agent wrappers
│   ├── interviewer/
│   │   ├── interviewer-agent.ts
│   │   ├── interviewer-planner.ts
│   │   └── interviewer-tools.ts
│   ├── sentinel/
│   ├── architect/
│   └── action/
├── interview-analyzer.ts     # Wrapped with reasoning
├── market-scraper.ts         # Wrapped with reasoning
├── initial-roadmap.ts        # Wrapped with reasoning
└── ... (existing, refactored)
```

---

## Implementation Phases

### Phase 1: Foundation 
**Goal:** Create the core autonomous agent infrastructure

| Task | Files to Create/Modify | Priority |
|------|----------------------|----------|
| Create `agent_memory` table | `src/drizzle/schema/agent-memory.ts` | HIGH |
| Create `agent_plans` table | `src/drizzle/schema/agent-plans.ts` | HIGH |
| Implement `BaseAutonomousAgent` class | `src/lib/agents/core/base-agent.ts` | HIGH |
| Create Tool Registry | `src/lib/agents/tools/tool-registry.ts` | MEDIUM |
| Create Memory Manager | `src/lib/agents/core/agent-memory.ts` | HIGH |

### Phase 2: Reasoning Layer
**Goal:** Add planning and reasoning capabilities

| Task | Files to Create/Modify | Priority |
|------|----------------------|----------|
| Implement Goal Decomposer | `src/lib/agents/reasoning/goal-decomposer.ts` | HIGH |
| Implement Plan Generator | `src/lib/agents/reasoning/plan-generator.ts` | HIGH |
| Implement Confidence Scorer | `src/lib/agents/reasoning/confidence-scorer.ts` | MEDIUM |
| Implement Iteration Controller | `src/lib/agents/reasoning/iteration-controller.ts` | HIGH |

### Phase 3: Pilot Agent
**Goal:** Transform Interview Preparation into first autonomous agent

| Task | Files to Create/Modify | Priority |
|------|----------------------|----------|
| Create Interviewer Agent wrapper | `src/trigger/jobs/agents/interviewer/` | HIGH |
| Integrate reasoning into interview prep | `src/trigger/jobs/interview-analyzer.ts` | HIGH |
| Add iteration loops | Existing job files | HIGH |
| Test and validate | Test files | HIGH |

### Phase 4: Agent Coordinator
**Goal:** Enable multi-agent orchestration

| Task | Files to Create/Modify | Priority |
|------|----------------------|----------|
| Implement Agent State Machine | `src/lib/agents/core/agent-state.ts` | HIGH |
| Create Agent Coordinator | `src/lib/agents/core/agent-coordinator.ts` | HIGH |
| Add inter-agent communication | Message bus extensions | MEDIUM |

### Phase 5: Rollout 
**Goal:** Transform remaining agents

| Task | Files to Create/Modify | Priority |
|------|----------------------|----------|
| Sentinel Agent autonomy | `src/trigger/jobs/agents/sentinel/` | MEDIUM |
| Architect Agent autonomy | `src/trigger/jobs/agents/architect/` | MEDIUM |
| Action Agent autonomy | `src/trigger/jobs/agents/action/` | MEDIUM |

---

## File Structure Changes

### New Directory Structure

```
src/
├── lib/
│   └── agents/
│       ├── core/                    # NEW
│       │   ├── base-agent.ts
│       │   ├── agent-state.ts
│       │   ├── agent-memory.ts
│       │   ├── agent-planner.ts
│       │   └── agent-coordinator.ts
│       ├── tools/                   # NEW
│       │   ├── tool-registry.ts
│       │   ├── tool-selector.ts
│       │   └── tool-executor.ts
│       ├── reasoning/               # NEW
│       │   ├── goal-decomposer.ts
│       │   ├── plan-generator.ts
│       │   ├── confidence-scorer.ts
│       │   └── iteration-controller.ts
│       ├── events.ts               # EXTEND
│       └── message-bus.ts          # EXTEND
├── drizzle/
│   └── schema/
│       ├── agent-events.ts         # EXISTS
│       ├── agent-memory.ts         # NEW
│       ├── agent-plans.ts          # NEW
│       └── agent-states.ts         # NEW
└── trigger/
    └── jobs/
        ├── agents/                  # NEW
        │   ├── interviewer/
        │   ├── sentinel/
        │   ├── architect/
        │   └── action/
        └── ... (existing jobs)
```

---

## Integration Strategy

### Backwards Compatibility

The existing event-driven architecture **will continue to work**. We're adding layers on top, not replacing:

```typescript
// BEFORE: Direct event trigger
await publishAgentEvent({
  type: 'INTERVIEW_COMPLETED',
  payload: { interview_id, user_id }
});

// AFTER: Same interface, but agents now REASON about events
await publishAgentEvent({
  type: 'INTERVIEW_COMPLETED',
  payload: { interview_id, user_id }
});
// ↳ Internally, the Interviewer Agent now:
//    1. Plans what analysis to perform
//    2. Selects appropriate tools
//    3. Iterates until confident
//    4. Stores insights in memory
```

### Migration Path

1. **Phase 1:** New tables + base classes (no breaking changes)
2. **Phase 2:** Reasoning components (no breaking changes)
3. **Phase 3:** Wrap existing jobs (opt-in, feature flag)
4. **Phase 4:** Enable for all users (gradual rollout)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Performance degradation** | Reasoning adds latency | Cache plans, async execution |
| **Infinite loops** | Agent never satisfied | Hard iteration limits, timeouts |
| **Token costs increase** | More AI calls | Use smaller models for reasoning |
| **Complexity explosion** | Hard to debug | Extensive logging, trace IDs |
| **Breaking existing flows** | User impact | Feature flags, gradual rollout |

---

## Next Steps

After this overview document, the following detailed documents will be created:

1. **02-REASONING_LAYER_INTEGRATION.md** - How to add planning/reasoning
2. **03-AGENT_STATE_MACHINE.md** - State machine implementation
3. **04-AGENT_MEMORY_SYSTEM.md** - Knowledge accumulation
4. **05-AGENT_COORDINATOR.md** - Multi-agent orchestration
5. **06-ITERATIVE_LOOPS.md** - Loop until conditions met
6. **07-TOOL_SELECTION.md** - Dynamic tool selection
7. **08-PILOT_INTERVIEW_AGENT.md** - First autonomous agent implementation

---

## Related Documents

- [PHASE_3_5_PLAN.md](../../PHASE_3_5_PLAN.md) - Message Bus Implementation
- [PHASE_5_HUME_AI.md](../../PHASE_5_HUME_AI.md) - Hume AI Integration
- [CLAUDE.md](../../CLAUDE.md) - Project Context

---

**Document Status:** Draft
**Next Review:** After team discussion
**Owner:** Development Team
