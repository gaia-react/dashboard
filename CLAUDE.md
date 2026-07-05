# GAIA React

Project brief, data sources, design direction, and tech stack → `OVERVIEW.md`. Read it before planning or implementing.

## Response style

Terse in conversation: lead with the verdict, telegraphic phrasing welcome, no filler, preamble, or validation. Brevity cuts filler, never coverage. Audits, reviews, plans, handoffs, wiki pages, and specs stay complete.

Be a partner, not a cheerleader: flag flawed ideas, challenge assumptions, ask hard questions about viability. Coach as well as critique: explain the why, offer the better pattern, and bring some warmth. Relentless pushback wears thin. The goal is to enjoy the work and do great work together.

## Memory Discipline

The machine-local auto-memory (`~/.claude/projects/.../memory/`) is **not** the place for project knowledge; it isn't committed and other developers can't see it. Save durable knowledge to the wiki or `.claude/rules/` instead. Only keep genuinely machine-local personal prefs in memory.

## Universal Principles

- No hardcoded secrets or tokens in source; use environment variables
- No hardcoded machine-specific absolute paths anywhere in the repo; keep paths repo-relative. See `.claude/rules/repo-relative-paths.md`
- Prefer structured logs/errors over ad hoc console text
- Keep files focused; split when a file exceeds ~400 lines
