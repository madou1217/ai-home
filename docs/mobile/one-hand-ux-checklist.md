# Mobile One-Hand UX Heuristic Checklist

Use this checklist in design review, QA review, and pre-release mobile UX sign-off for command-center critical flows.

## Scope
- Target screens: `SessionScreen`, `TaskScreen`, `OpsQuickActions`, status/log panels.
- Target actions: start task, retry, stop, refresh, switch account, open error details.
- Device posture: one-hand operation on 5.4"-6.9" phones, left-hand and right-hand usage.

## Scoring Rubric
- Pass: all `P0` items pass and at least 80% of `P1` items pass.
- Conditional pass: all `P0` items pass and 60%-79% of `P1` items pass with tracked follow-ups.
- Fail: any `P0` item fails or less than 60% of `P1` items pass.

## Heuristic Checklist

### A. Thumb Reach and Action Placement
| ID | Priority | Check | Pass Criteria |
|---|---|---|---|
| A1 | P0 | Critical primary action is in natural thumb zone | Bottom-half CTA for each key path; no required top-corner tap for completion |
| A2 | P0 | High-frequency actions are one-step reachable | Retry/Stop/Refresh reachable in <=2 taps from default view |
| A3 | P1 | Left/right hand parity | Core actions can be triggered without precision stretch on both grips |
| A4 | P1 | Floating or sticky controls do not hide content | No overlap with error banners, keyboard, or safe-area insets |

### B. Visual Hierarchy and State Clarity
| ID | Priority | Check | Pass Criteria |
|---|---|---|---|
| B1 | P0 | Current status is the top visual signal | Status card/line appears above secondary metadata and logs |
| B2 | P0 | Primary CTA visually dominates secondary actions | Size/contrast/placement clearly identifies next best action |
| B3 | P1 | Error and recovery cues are obvious | Failure state shows immediate recovery CTA and short reason text |
| B4 | P1 | Dense content remains scannable | Long logs/details are collapsed with clear summary line |

### C. Interaction Cost and Error Tolerance
| ID | Priority | Check | Pass Criteria |
|---|---|---|---|
| C1 | P0 | Critical paths minimize context switching | User completes trigger->track->recover without screen hopping |
| C2 | P0 | Destructive actions are guarded but fast | Stop/Cancel has confirmation or undo, without deep modal chains |
| C3 | P1 | Tap targets meet mobile accessibility baseline | Interactive targets are >=44x44 px equivalent touch area |
| C4 | P1 | In-flight feedback is immediate | Pressing key action shows progress/loading state within 300 ms |

### D. Weak-Network and Recovery Usability
| ID | Priority | Check | Pass Criteria |
|---|---|---|---|
| D1 | P0 | Offline/degraded state is explicit | User sees offline/reconnecting hint with next action guidance |
| D2 | P0 | Recovery path is one-hand friendly | Manual retry and auto-retry status visible near primary controls |
| D3 | P1 | Duplicate action risk is controlled | Repeated taps are debounced or state-locked during critical calls |
| D4 | P1 | User never loses orientation after retries | Status timeline/history preserves recent transitions and timestamps |

## Review Record Template
| Item | Result |
|---|---|
| Product area | Mobile Command Center |
| Build/version | |
| Reviewer | |
| Date (UTC) | |
| P0 pass count / total | |
| P1 pass count / total | |
| Final score | Pass / Conditional pass / Fail |
| Follow-up tickets | |

## Sign-off Rule
- Release gate requires at least `Conditional pass`.
- Any `P0` fail blocks release until fixed and re-reviewed.
