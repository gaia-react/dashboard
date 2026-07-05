---
name: react-code
description: Patterns and conventions for writing and editing React code, including components and hooks. Use this skill whenever writing or reviewing React components, hooks (useEffect, useCallback, useState), event handlers, or component extraction decisions. Also trigger when debugging stale closures, infinite re-renders, or unnecessary re-renders caused by memoization issues, or when deciding whether to add a dependency, reach for a web-platform API (Intl, URL, crypto.randomUUID), or hand-roll a primitive. Also trigger when choosing a React 19 idiom, deciding between forwardRef and ref-as-prop, useContext and use(), or Context.Provider and the Context shorthand; when conditional rendering risks the && numeric-0 leak;
---

# React Code

Write and edit React components and hooks following project conventions.

## Reach for the Platform First

Before installing a package or hand-rolling a primitive, walk this ladder and stop at the first hit:

1. **Existing project code**, a component, hook, or util already covers it.
2. **Web platform**, a browser API or native element does the job: `Intl` (dates, numbers, lists, plurals), `URL` / `URLSearchParams`, `crypto.randomUUID()`, `structuredClone()`, `AbortController`, native `Array` / `Object` methods, `<dialog>`, modern CSS (`:has()`, container queries).
3. **Already-installed dependency**, check `package.json` before adding a sibling that does the same job.
4. **New dependency**, only when 1-3 genuinely fall short; the added weight has to earn its place.
5. **Custom code**, last resort, kept minimal.

The largest real savings come from `Intl` over date/number-formatting libraries and native collection methods over `lodash`/`underscore` (already enforced by `you-dont-need-lodash-underscore`). Reaching for the platform replaces a needless dependency or bespoke widget; it never overrides accessibility, input validation, or an existing GAIA component (a wrapper exists for a reason).

## Pre-Flight Gates

Most hook bugs come from misidentifying the type of problem being solved. Before writing or editing hooks, run through these gate, it only applies when the relevant pattern is present in your changes.

### Gate 1: Hook Check

**Before writing `useEffect`:**

1. Can I calculate this during render? → Derive inline or `useMemo`, no Effect needed.
2. Does this respond to a user action? → Put it in the event handler, no Effect needed.
3. Am I syncing state to other state? → Derive it; remove the redundant state, no Effect needed.
4. Am I notifying a parent of a state change? → Call both setters in the handler, no Effect needed.
5. Do I need to reset child state when a prop changes? → Use `key`, no Effect needed.
6. Am I synchronizing with an external system (browser API, third-party widget, network)? → Effect is appropriate here. Add cleanup. For data fetching, include an `ignore` flag.

**Before writing `useCallback`:**

Only use when the function is:

1. Passed as a prop to a `memo`-wrapped component
2. A dependency of `useEffect`, `useMemo`, or another `useCallback`
3. Passed to a child that uses it in a hook dependency array

If none apply, skip `useCallback`, it adds indirection without benefit.

**`useState` type inference:** Omit explicit type when inferable from the default value. Add types for unions or complex objects. For an absent initial value, prefer `undefined` over `null` (GAIA never-null): `useState<T>()` is already typed `T | undefined`.

### Gate 2: React 19 Idiom Check

GAIA writes React 19 idioms. The work here is to not regress to pre-19 habits.

**Before writing `forwardRef`: don't.** In React 19, `ref` is an ordinary prop on function components, so `forwardRef` is no longer needed (slated for deprecation in a future release). Destructure `ref` directly from props instead.

```tsx
// BAD, needless indirection
const InputText = forwardRef<HTMLInputElement, Props>((props, ref) => <input ref={ref} {...props} />);
// GOOD, ref is just a prop
const InputText: FC<Props> = ({ref, ...rest}) => <input ref={ref} {...rest} />;
```

The ref _type_ (`Ref<T>`, or `ComponentProps<'input'>` already carrying `ref`) is the typescript skill's domain.

**Before writing `&&` in JSX, make the left operand a real boolean.** `&&` returns its left operand when falsy. `false`/`null`/`undefined` render nothing, but a numeric **`0`** is a renderable value and leaks the literal "0" into the DOM. This is the most common React rendering bug, so coercing a numeric operand is mandatory, not a stylistic option. **Lint catches the `.length && <JSX/>` form in real time** (via `no-restricted-syntax`); the general `count && <X/>` case is caught at pre-merge audit by react-doctor's type-aware `rendering-conditional-render` rule, which reports any numeric operand as a Bug. Coerce as you write rather than waiting for the audit: `count > 0`, `count !== 0`, or `!!count`.

```tsx
// BAD, renders "0" when the list is empty
{items.length && <List items={items} />}
// GOOD, force a real boolean
{items.length > 0 && <List items={items} />}
```

For render-or-nothing, a boolean-guarded `&&` is the idiom; it replaces the old `cond ? <X/> : null`. A ternary is only for a genuine either/or where both arms render, never `: null`.

**Before writing `useContext` or `<Context.Provider>`, use the React 19 forms.** Read context with `use()` (unlike `useContext`, it may be called conditionally or after an early return); render the context object directly as the provider.

```tsx
const nonce = use(NonceContext); // not useContext(NonceContext)
<NonceContext value={nonce}>{children}</NonceContext>; // not <NonceContext.Provider>
```

`<Context.Provider>`/`<Context.Consumer>` are legacy (deprecation planned). GAIA uses the `<Context>` shorthand and `use()` exclusively, never `.Provider`, `.Consumer`, or `useContext`. Convert any you find.

Rendering nothing from a `return` is enforced by `@gaia-react/lint`'s `no-null-render` rule (autofix); a `: null` ternary arm is caught by `no-restricted-syntax` (report-only). No manual rewrite needed.

For `useEffectEvent` (the sanctioned replacement for stale-deps / latest-ref hacks) and ref-callback cleanup functions, see `references/hook-patterns.md`.

## Component Structure

- **FC typing:** `const MyComponent: FC<Props> = ({...}) => ...`
- **One component per file**: keeps co-location clean and makes code-splitting predictable
- **Named React imports:** `import {useState} from 'react'`, never `React.useState()`, avoids the React namespace and makes tree-shaking explicit
- **Type imports:** `import type {ChangeEventHandler} from 'react'`, never `React.FC`
- **Event handler types:** Prefer `ChangeEventHandler<HTMLInputElement>` over inline event typing
- **Event handler naming:** `handle{Action}{Element}`, the `{Element}` is required so the name says _what it does_, not just _when it fires_; e.g. `handleClickSave`, `handleChangeInput`, `handleCopyStack`. A bare event name (`handleClick`, `handleChange`, `handleSubmit`) trips `react-doctor/no-generic-handler-names`.

### Component Extraction

Extract when a section meets **all** criteria:

1. Self-contained (own state/fetcher, or pure display with no shared state)
2. Clear boundary (visible UI section with small props interface)
3. ~60+ lines of JSX/logic

**Do not extract** when state/refs are shared across sections, extraction needs 5+ props/callbacks, section is under ~60 lines, or form validation is tightly coupled.

How: Create `ParentComponent/NewSection/index.tsx`, move exclusive types/state/handlers/JSX, define minimal `Props` type.

## References

- `references/hook-patterns.md`, Read when writing any Effect or useCallback, or when debugging stale closures, double-firing effects, or infinite re-renders.
