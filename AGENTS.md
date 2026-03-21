# AGENTS.md

This is the entry point for agent navigation in this repository.
It is a map, not a manual.

You are given a map, not a manual. Your entry point is intentionally sparse.
When you need deeper context on any topic, follow the pointers. Do not attempt
to reason from this file alone on complex tasks. Navigate to the relevant source
of truth first.

Your first act on any non-trivial task is navigation, not execution.

---

## What this repository is

Tracksy is a personal work tracking desktop application for Linux (KDE Plasma). It is a Tauri 2
shell (Rust) wrapping a React + Vite + TypeScript web UI. SQLite is the local data store. The
app lives in the KDE system tray when minimized. There is no authentication. There is one user.

The full product specification is in `SPEC.md`. Read it before starting any task.

---

## Repository map

| Path | What it is |
|---|---|
| `SPEC.md` | Authoritative product spec: data model, IPC surface, tray behavior, CDP validation, golden principles, validation matrix, deferred decisions |
| `ARCHITECTURE.md` | Domain and layer map (grows as codebase grows; create it when the first non-trivial structure exists) |
| `src-tauri/src/commands/` | Rust IPC command implementations |
| `src-tauri/src/db/migrations/` | Sequential SQL migration files |
| `src/store/workItems.ts` | Zustand store — in-memory source of truth for the UI |
| `src/types/` | Zod schemas and TypeScript interfaces for IPC boundary validation |
| `src/lib/fractional.ts` | Midpoint sort_order utilities |
| `src/lib/tree.ts` | Flat array → tree construction |
| `docs/design-decisions/` | Architectural decision records (ADRs) — one file per decision |
| `docs/plans/active/` | In-progress execution plans |
| `docs/plans/completed/` | Finished plans (history, not instructions) |
| `tests/cdp/` | CDP-driven validation scripts — one file per user journey |

---

## How to navigate deeper

- Data model, field definitions, invariants → `SPEC.md` § 4 and § 5
- IPC commands and Rust handler responsibilities → `SPEC.md` § 6
- Tray and window behavior → `SPEC.md` § 7
- CDP validation loop and data-testid convention → `SPEC.md` § 8
- Golden principles (all 10) → `SPEC.md` § 9
- Failure classification and reversibility hierarchy → `SPEC.md` § 11
- Validation matrix (definition of done) → `SPEC.md` § 12
- Deferred decisions (do not invent answers for these) → `SPEC.md` § 13
- Past architectural decisions → `docs/design-decisions/`
- Active tasks → `docs/plans/active/`

If the information you need does not exist in any of these locations, that is a gap.
Surface it before proceeding, not after.

---

## Before you write any code

### Step 1: Read the spec

Read `SPEC.md` in full if you have not already in this session. Do not assume the spec matches
what you last saw. Treat every session as a fresh read.

### Step 2: Write a specification for your task

Before executing anything non-trivial, write a task specification. A task specification is not
a plan — it is a statement of what the completed work will look like and how you will know
when it is done. It must include:

- The success criterion: what observable condition signals completion?
- The scope boundary: what is explicitly out of scope for this task?
- The assumptions: what are you treating as true that you have not verified?
- The termination condition: under what conditions do you stop and surface a failure rather
  than continuing?

A task without a stopping condition drifts. Tasks without stopping conditions do not complete.
When a specification is too hard to write, that is a signal: the task is under-specified or
you are missing information. Surface this before executing.

### Step 3: Preflight the environment

You are a deliberative agent, not a reactive one. Before spawning sub-tasks or writing code,
inspect the current state of the environment. Build a complete picture of what is already true.

For each component you plan to touch:
- If it exists and is correct: SKIP
- If it is missing or stale: PENDING
- If a re-run was explicitly requested: FORCE

Never assume a clean slate. Your first act is observation, not execution.

### Step 4: Check the golden principles

Identify which of the 10 golden principles in `SPEC.md` § 9 apply to your task. Validate your
output against all of them before surfacing results. Self-enforcement is your responsibility.

---

## Golden principles summary

Authoritative source: `SPEC.md` § 9. This is a summary only.

| # | Principle | What it protects |
|---|---|---|
| GP-1 | No hard deletes — always set `deleted_at` | Sync-readiness, data recovery |
| GP-2 | Timestamps written by Rust handler only | Sync-readiness, clock trust |
| GP-3 | IDs are UUID v4 strings | Sync-readiness, no sequential IDs |
| GP-4 | Zod validation at IPC boundary | Type safety, no raw JSON in store |
| GP-5 | `data-testid` on all interactive elements | Agent validation reliability |
| GP-6 | Frontend never imports `tauri-plugin-sql` | Architectural boundary |
| GP-7 | Tailwind utility classes only | Style consistency, agent predictability |
| GP-8 | Fractional `sort_order`, never bulk-shift | Reorder correctness |
| GP-9 | Cycle prevention on `parent_id` changes | Data integrity |
| GP-10 | No undocumented architectural decisions | Agent legibility |

If your output violates any of these, fix it before surfacing the result.
If uncertain whether a violation exists, state the uncertainty. Do not proceed silently.

---

## CDP validation

When validating UI behavior, use the CDP endpoint exposed by Tauri's `devtools` feature.

Boot: `cargo tauri dev`
Connect: use the CDP endpoint logged to stdout at startup

Standard loop:
1. Connect to CDP
2. Snapshot DOM before action (use `data-testid` selectors exclusively)
3. Execute action via CDP input or `Runtime.evaluate`
4. Snapshot DOM after action
5. Assert against `data-testid` and DOM structure — never pixel coordinates or CSS class names
6. Report PASS or FAIL with both snapshots as evidence

CDP scripts live in `tests/cdp/`. One script per user journey. Existing scripts are regression
tests. If a regression test fails, fix the behavior — do not modify the test to make it pass.

---

## Termination conditions

Every task has exactly one of three valid terminal states:

**SUCCESS**: the success criterion has been met. Output satisfies the specification. Deliver and stop.

**BLOCKED**: you cannot proceed without information or capability you do not have. Surface the
specific blocker — what you need, why you need it, what you tried — and stop. Do not work around
a blocker silently. Do not substitute a guess for missing input.

**ABANDONED**: the task as specified cannot be completed. State what you learned about why it
cannot be done and stop. Do not conflate a partial result with a success. 80% of X is not X unless
the specification explicitly says it is.

Any other reason for stopping is one of the above in disguise. Name it correctly.

---

## Failure handling

Before responding to any failure, classify it. The classification determines the response.

**TRANSIENT**: likely temporary; retry would succeed. Retry once. Escalate if it persists.
Do not mask transient failures by proceeding without the result.

**PERMANENT**: stable condition; retry will not help. Stop. Surface the error with diagnosis.
Do not retry permanent failures.

**AMBIGUOUS**: cannot tell. Default to PERMANENT. A transient failure treated as permanent
wastes one attempt. A permanent failure treated as transient wastes all remaining attempts.

When surfacing a failure, include the diagnosis. "The command failed" is not useful. "The command
failed with error X at line Y, which indicates Z" is useful.

---

## Reversibility

Before any action that modifies data or structure, grade its reversibility:

- **INSTANT REVERT**: soft deletes, Zustand state updates backed by SQLite. Prefer these.
- **RECOVERABLE**: any SQLite mutation. Soft-delete ensures no data is ever lost.
- **DIFFICULT**: schema migrations without a documented rollback. Document the rollback path first.
- **IRREVERSIBLE**: Tracksy has no irreversible operations by design. If you are about to take an
  action with no recovery path, stop and surface it as a design issue before proceeding.

Choose the path of highest reversibility when multiple approaches exist. The cost of a detour
is less than the cost of an unrecoverable mistake.

---

## Scope discipline

Your mandate for any given task is bounded. Before acquiring any capability, file access,
or permission, ask: does the current task require this? If the answer is "a future task might
need it," do not acquire it now. Request the minimum. Future tasks will request what they need.

This applies to file reads, database queries, and tool access. Do not collect data you do not
need for the current task.

---

## On entropy

This codebase is agent-generated. Agents replicate patterns that already exist — including
suboptimal ones. Over time this produces drift.

When you see inconsistency with the golden principles or the spec, open a targeted fix.
Prefer small, reviewable corrections over large refactors. Do not let drift compound.

When something goes wrong, the fix is almost never "try harder." Ask: what capability,
constraint, or knowledge is missing from the scaffolding? Encode the answer so it cannot
fail the same way again. Every failure is a scaffolding gap.

---

## Required actions before specific implementations

These are specification-before-execution requirements. Do not proceed with these features without
first completing the listed prerequisite.

| Feature | Required prerequisite |
|---|---|
| Tray implementation | Create `docs/design-decisions/display-server.md` documenting X11 vs. Wayland findings from `echo $XDG_SESSION_TYPE` |
| Any schema migration | Create migration file in `src-tauri/src/db/migrations/` AND create design decision doc |
| Any new component | Ensure all interactive elements carry `data-testid` before considering the component done |
| Any `parent_id` update path | Verify cycle detection is implemented and tested in the Rust handler |

---

## What agents must not do

- Execute `DELETE FROM work_items` under any circumstances
- Write `created_at` or `updated_at` from the frontend
- Use sequential integers as IDs for any record
- Place raw Tauri command response data into the Zustand store without Zod parsing
- Import `@tauri-apps/plugin-sql` from the frontend
- Add CSS outside of Tailwind utility classes without a documented exception
- Bulk-shift `sort_order` values of siblings during a reorder
- Proceed past an ambiguous specification — surface the ambiguity first
- Modify an existing CDP test script to make an assertion pass — fix the underlying behavior
- Implement any feature listed in `SPEC.md` § 13 (Deferred Decisions) without a prior design
  decision record documenting the resolution

---

## Undocumented decisions do not exist

Any architectural decision, alignment, or taste preference that shapes this codebase must exist
as a versioned markdown file in `docs/design-decisions/` before it can influence agent behavior.
If it lives only in a chat thread, a comment, or a person's memory — it does not exist for this
system. Encode it or it will be lost and a future agent will invent something incompatible.
