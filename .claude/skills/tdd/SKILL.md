---
name: tdd
description: Test-driven development with red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

# Test-Driven Development

## Selecting a Stack Reference

This project tests with Vitest + React Testing Library (component/hook tests) and happy-dom (DOM environment). No stack reference doc exists yet, once real components and test patterns solidify, add `references/tests-react.md` covering the concrete patterns, mocking rules, and good/bad examples for this stack.

## Philosophy

**Core principle**: tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style, they exercise real code paths through public APIs and describe _what_ the system does, not _how_. A good test reads like a specification: "user submits a valid form and sees a success toast" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, spy on state setters, or assert on internal call signatures. The warning sign: your test breaks when you refactor, but behavior hasn't changed.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing", treating RED as "write all tests" and GREEN as "write all code."

Tests written in bulk test _imagined_ behavior, not _actual_ behavior. You outrun your headlights, committing to structure before understanding the implementation, producing tests insensitive to real changes.

**Correct approach**: vertical slices via tracer bullets. One test → one implementation → repeat.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Workflow

### 1. Planning

Before writing any code:

- [ ] Confirm which layer owns this test (see stack reference for layer breakdown)
- [ ] Confirm which behaviors to test (prioritize)
- [ ] Identify opportunities for [deep modules](deep-modules.md), small interface, deep implementation
- [ ] Design interfaces for [testability](interface-design.md)
- [ ] List the behaviors to test (not implementation steps)
- [ ] Get user approval on the plan

Ask: "What should the public interface look like? Which behaviors are most important to test?"

**You can't test everything.** Focus on critical paths and complex logic, not every edge case.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing end-to-end for this layer. `RED → GREEN`. The tracer bullet confirms the testing infrastructure wires up before adding real coverage.

### 3. Incremental Loop

For each remaining behavior: `RED → GREEN`. One test at a time. Only enough code to pass the current test. Don't anticipate future tests.

**Bound the green chase.** If a test won't pass after a few focused attempts, stop and reassess instead of thrashing the implementation: the test, the interface, or an assumption may be wrong. Surface the blocker rather than looping indefinitely to force green.

#### Authoring an honest RED

**Author the test against the not-yet-written or stub implementation symbol.** Write the test for the behavior you are about to build, pointing at a symbol that does not exist yet (or exists only as a stub that returns the wrong value). Run it; it fails because the implementation is missing or incomplete. That failure is the honest RED: a real missing-implementation failure, not a manufactured one. Then write the implementation that turns it green.

```
RIGHT:  test names parseAmount() → run → fails (parseAmount undefined / stub) → implement → green
WRONG:  implement parseAmount() → write the test → break parseAmount() to force red → restore it → green
```

**Never break working production code to force a red, then restore it.** That pattern is theater: it proves nothing about the test, and mutating the implementation just to flip it back defeats the purpose of RED in the first place. The honest path is always to author the test against the absent or stub symbol, so the red comes for free from the missing implementation.

**If the implementation already exists** (landing impl and test together in one pass), don't manufacture a red by breaking and restoring it. Author the test honestly against the existing behavior instead, and lean on the Checklist Per Cycle below to catch anything that slipped in without a real RED.

### 4. Refactor

After all tests pass, look for [refactor candidates](refactoring.md):

- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Apply SOLID principles where natural
- [ ] Consider what new code reveals about existing code
- [ ] Run tests after each refactor step

**Never refactor while RED.** Get to GREEN first.

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only (no spying on internals)
[ ] Test would survive an internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
[ ] Mock only at system boundaries (network, time, randomness)
```
