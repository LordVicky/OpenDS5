# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Purpose

This repository uses specialized subagents to separate planning, implementation, investigation, testing, and review.

The primary agent acts as the orchestrator. It should delegate substantial work instead of performing the entire task in the main thread.

These rules apply to all repository work unless a more specific `AGENTS.md` exists in a subdirectory.

---

## Core rule

Use the appropriate subagent for each stage of work.

The primary agent should coordinate, summarize, and make final decisions. It should not perform implementation, detailed code review, or broad architectural investigation itself when a suitable subagent is available.

Preferred workflow:

```text
Existing plan review
        ↓
Planner, only when needed
        ↓
Implementer
        ↓
Test and validation pass
        ↓
Reviewer
        ↓
Implementer fixes findings
        ↓
Reviewer verifies fixes
        ↓
Primary agent reports results
```

---

## Available roles

Use the repository’s configured agent names where available.

Expected roles:

```text
planner
implementer
reviewer
investigator
tester
```

When spawning the planner, use the `gpt-5.6-sol` model. If that model is not
available, use the closest available compatible model and report the fallback.

If the environment uses different names, select the closest equivalent specialized agent.

Do not claim that a subagent was used unless it was actually invoked.

---

## Primary agent responsibilities

The primary agent must:

* Read applicable instructions.
* Inspect the worktree status.
* Determine whether an existing plan already covers the task.
* Select and invoke the appropriate subagents.
* Provide subagents with precise scope and repository context.
* Prevent overlapping edits between agents.
* Review subagent summaries and tool results.
* Ensure tests are run.
* Ensure review findings are fixed.
* Present the final user-facing summary.
* Avoid making commits or pushing unless explicitly requested.

The primary agent may perform small coordination tasks such as:

* Reading `AGENTS.md`
* Reading an existing `plan.md`
* Checking `git status`
* Checking branch names
* Listing relevant files
* Running a final consolidated validation command
* Applying a trivial one-line correction after review

The primary agent should not use these exceptions to avoid delegation.

---

## Plan sufficiency and planner rule

Before invoking the planner, determine whether the user’s request or an
existing accepted plan is already sufficiently detailed to implement safely.
The planner is not required when the prompt itself defines the requested
behavior, scope, constraints, architecture boundaries, and validation
criteria—as a detailed feature specification can do.

Search for an existing accepted plan when the prompt does not already provide
that information.

Check, in order:

1. A plan explicitly supplied by the user.
2. `plan.md` in the repository root.
3. A relevant plan in `docs/`, `.codex/`, or a feature directory.
4. A detailed GitHub issue or task description already available in the session.
5. A prior implementation plan clearly referenced by the user.

If the prompt or an existing plan is clear, current, and sufficiently specific:

* Do not invoke the planner.
* Give the prompt or plan directly to the implementer.
* Ask the implementer to report conflicts before deviating.

Invoke the planner only when:

* The prompt and any existing plan are materially incomplete.
* The prompt or plan conflicts with the current architecture and the conflict
  cannot be resolved by a scoped implementation decision.
* The user requests a new plan.
* The task requires significant design choices not covered by the prompt or
  plan.
* The scope crosses several subsystems without defined boundaries.
* A reviewer identifies an architectural issue requiring replanning.

Do not invoke the planner merely because the task is large or because no
separate plan file exists when the user’s prompt is already implementation
ready.

If a configured role model is unavailable in the current environment, retry
that role with an available compatible model override when the tooling allows
it. Report the fallback only if it materially changes the work; model
availability is an environment constraint, not a repository-planning reason.

---

## Planner role

The planner is responsible for design and decomposition, not implementation.

The planner should:

* Inspect the relevant architecture.
* Identify affected subsystems.
* Locate repository conventions.
* Define scope and non-goals.
* Identify compatibility risks.
* Define implementation phases.
* Define tests and acceptance criteria.
* Identify decisions requiring maintainer input.
* Recommend a reviewable PR boundary.

The planner must not:

* Edit production code.
* Perform the implementation.
* Expand the task beyond the user’s request.
* Replace a clear accepted plan without explaining why.
* Produce a generic plan that ignores the current repository.

Planner output should include:

```text
1. Current architecture
2. Proposed approach
3. Files or subsystems affected
4. Scope
5. Non-goals
6. Risks
7. Test strategy
8. Acceptance criteria
9. Open questions
```

---

## Implementer role

The implementer is the default agent for code changes.

Invoke the implementer automatically when the user asks to:

* Implement a plan.
* Add a feature.
* Fix a bug.
* Refactor code.
* Update tests.
* Remove obsolete functionality.
* Modify configuration.
* Apply reviewer feedback.
* Complete an existing task.

Do not keep implementation in the primary thread merely because the user used wording such as:

```text
implement this
do the plan
make the changes
continue
fix it
apply this
```

Those requests should invoke the implementer.

The implementer must:

* Read applicable instructions and plans.
* Inspect existing code before editing.
* Preserve unrelated local changes.
* Follow repository conventions.
* Keep the diff within scope.
* Add or update tests.
* Run focused validation.
* Report architectural conflicts before broad deviation.
* Report files changed and checks run.
* Avoid commits and pushes unless explicitly requested.

The implementer must not:

* Re-plan a clear task without cause.
* Perform unrelated cleanup.
* Reformat unrelated files.
* Update dependencies without necessity.
* Change release versions.
* Modify generated files.
* Silence failing tests without explaining the root cause.
* Claim hardware validation that was not performed.

---

## Investigator role

Use an investigator for focused technical research inside the repository.

Suitable tasks include:

* Mapping an unfamiliar subsystem.
* Tracing an input or data flow.
* Finding where a feature is implemented.
* Locating all references before deleting code.
* Investigating a regression.
* Comparing two implementation paths.
* Inspecting daemon, kernel, IPC, audio, or device interactions.
* Determining why a test or runtime behavior fails.

The investigator should remain read-only unless explicitly told otherwise.

The investigator should return:

```text
1. Relevant files
2. Current flow
3. Root cause or likely cause
4. Constraints
5. Recommended implementation point
6. Risks
```

Use the investigator before the implementer when the task depends on uncertain architecture or a difficult root cause.

Do not use the primary thread for a broad repository investigation when an investigator is available.

---

## Tester role

Use a tester when validation is substantial or spans several components.

Suitable cases:

* Native daemon and Electron code both changed.
* Input timing or gesture behavior changed.
* Audio, haptics, controller output, or device lifecycle changed.
* Settings migrations changed.
* Multiple test suites must be run.
* Hardware/manual test instructions must be prepared.
* A regression requires reproduction.

The tester should:

* Inspect actual repository scripts.
* Run the narrowest relevant tests first.
* Run broader validation afterward.
* Distinguish implementation failures from environment failures.
* Avoid claiming tests passed when they were not run.
* Report exact commands and outcomes.
* Identify unverified hardware or platform behavior.

The tester should not modify production code unless explicitly acting as an implementer afterward.

---

## Reviewer role

A reviewer must be invoked after every material code change.

Material changes include:

* New features.
* Bug fixes affecting behavior.
* Refactors across multiple files.
* Input handling.
* Haptics or controller output.
* IPC.
* Persistence or migrations.
* Process execution.
* Security-sensitive changes.
* Device handling.
* Removal of an existing feature.
* Changes intended for a pull request.

The reviewer must inspect the actual diff.

The reviewer should check:

* Correctness.
* Regressions.
* Scope compliance.
* Architecture consistency.
* Race conditions.
* Lifecycle cleanup.
* Error handling.
* Security.
* Test quality.
* Missing tests.
* Misleading naming.
* Dead code.
* Unhandled compatibility cases.
* User-facing behavior.
* Documentation accuracy.

The reviewer must not implement the feature during the first review pass.

Reviewer output should classify findings:

```text
Blocking
Major
Minor
Optional
```

Every blocking or major finding must be addressed before final completion.

---

## Review-fix loop

After the reviewer reports findings:

1. Send blocking and major findings to the implementer.
2. Ask the implementer to apply focused fixes.
3. Run relevant tests again.
4. Invoke the reviewer again to verify the fixes.
5. Repeat until no blocking or major findings remain.

Do not mark the task complete while material review findings remain unresolved.

Minor findings may remain only when:

* They are explicitly documented.
* They are outside the accepted scope.
* Fixing them would cause unrelated churn.
* The user or maintainer accepts them.

---

## Parallel work

Subagents may work in parallel only when their scopes do not overlap.

Safe examples:

```text
Investigator A:
Inspect existing notification infrastructure.

Investigator B:
Trace controller haptic output.

Tester:
Inspect available test commands.
```

Unsafe examples:

```text
Implementer A edits settings.ts.
Implementer B also edits settings.ts.
```

Do not allow multiple agents to edit the same subsystem concurrently unless the worktree and merge strategy are explicitly isolated.

Prefer sequential implementation when changes share files or types.

---

## Task routing

Use this routing guide.

### Planning request

Examples:

```text
Create a plan.
Design this feature.
How should we implement this?
```

Action:

```text
Invoke planner.
```

### Clear existing plan

Examples:

```text
Implement plan.md.
Continue the accepted plan.
Build phase 2.
```

Action:

```text
Skip planner.
Invoke implementer.
```

### Unclear bug

Examples:

```text
This stopped working.
Find why this crashes.
The controller is detected but no haptics play.
```

Action:

```text
Invoke investigator.
Then invoke implementer if a code fix is identified.
Then invoke reviewer.
```

### Direct implementation

Examples:

```text
Add this feature.
Remove the overlay.
Add shortcut notifications.
```

Action:

```text
Invoke implementer.
Then invoke reviewer.
```

### Review request

Examples:

```text
Review this diff.
Check my PR.
Does this satisfy the comments?
```

Action:

```text
Invoke reviewer.
Do not inspect the implementation in the primary thread unless needed to coordinate.
```

### Test request

Examples:

```text
Run the tests.
Check whether this works.
Validate this implementation.
```

Action:

```text
Invoke tester.
```

### Small trivial edit

Examples:

```text
Fix one typo.
Rename one label.
Change one literal.
```

Action:

```text
Primary agent may perform directly.
Reviewer is optional only when the change is genuinely trivial.
```

---

## OpenDS5-specific routing

Use an investigator before implementation for changes involving:

* `vdsd`
* `vds_hcd`
* Physical-to-virtual controller routing
* DualSense audio haptics
* PipeWire or WirePlumber
* HID reports
* evdev device selection
* Adaptive triggers
* Native game haptic mixing
* Bluetooth controller ownership
* Multiple controller identities

Use a reviewer with explicit OpenDS5 checks for:

* Legacy rumble accidentally labelled HD haptics.
* Wrong audio channel routing.
* Haptic output leaking into speaker channels.
* Adaptive-trigger state being reset.
* Wrong-controller targeting.
* Controller disconnect cleanup.
* Steam Input compatibility.
* Native DualSense game compatibility.
* Input gestures emitting duplicate actions.
* Timers surviving application shutdown.
* `vdsd` and companion protocol mismatches.

---

## Instructions passed to subagents

Every subagent prompt should include:

* Exact task.
* Relevant plan.
* Scope.
* Non-goals.
* Files or subsystems likely involved.
* Required tests.
* Constraints.
* Expected report format.
* Whether edits are permitted.
* Whether commits or pushes are permitted.

Do not send vague instructions such as:

```text
Look into this.
Fix everything.
Improve the code.
```

Prefer:

```text
Inspect the existing shortcut feedback implementation and determine why it
uses legacy rumble instead of the DualSense audio-haptics path. Remain
read-only. Identify the output path, channel mapping, lifecycle hooks,
tests, and the smallest safe implementation point.
```

---

## Worktree safety

Before any editing agent runs:

```bash
git status --short
git branch --show-current
```

Rules:

* Preserve unrelated modifications.
* Do not reset the worktree.
* Do not use destructive Git commands without explicit permission.
* Do not delete untracked files unless they were created by the current task.
* Do not force-push unless explicitly instructed.
* Use `--force-with-lease`, never plain `--force`.
* Do not commit or push unless the user asks.

When a dirty worktree contains overlapping files, stop the editing agent and report the conflict.

---

## Validation rules

Agents must use actual repository scripts rather than guessing.

Typical companion checks may include:

```bash
cd ds5-bridge/companion
npm run typecheck
npm run test:companion
npm run build:app
```

Native, daemon, kernel, or Nix changes may require additional checks.

Rules:

* Run focused tests first.
* Run broader tests after focused tests pass.
* Report exact commands.
* Report exact failures.
* Separate environment failures from implementation failures.
* Do not claim hardware behavior without hardware testing.
* Do not conceal skipped checks.


## Nix validation

For changes affecting OpenDS5’s Nix support, run:

```bash
nix flake check -L
nix build -L
```

Also verify the built output contains the expected OpenDS5 binaries and integration files. Report exact failures and do not claim Nix support works unless the flake build was run.


---

## Completion criteria

A material implementation task is complete only when:

* The implementer finished the scoped work.
* Relevant tests were run.
* A reviewer inspected the diff.
* Blocking and major findings were fixed.
* The reviewer verified the fixes.
* Remaining limitations are documented.
* No unrelated changes were introduced.
* The final response accurately reports what was and was not verified.

---

## Final response format

The primary agent should summarize:

```text
1. What changed
2. Subagents used
3. Files changed
4. Architectural decisions
5. Tests and builds run
6. Review findings and fixes
7. Unverified behavior
8. Remaining limitations
9. Suggested commit title
10. Suggested PR title
```

Do not expose hidden reasoning or raw subagent transcripts.

Summarize their findings and results clearly.

---

## Fallback when subagents are unavailable

If the environment does not expose subagent tools:

* State that specialized subagents are unavailable.
* Perform the stages sequentially in the primary thread.
* Preserve the same planner → implementer → reviewer separation conceptually.
* Do not pretend agents were invoked.
* Keep the implementation and review passes distinct.
* Perform a fresh diff review after implementation.

Do not use subagent unavailability as a reason to skip testing or review.
