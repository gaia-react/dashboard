# Dependency-CVE Advisory, pnpm audit

`pnpm audit --json` is the oracle for known-vulnerable dependencies, read-only and advisory, never blocking. High/critical advisories are surfaced; low/moderate transitive noise is dropped. No baseline allowlist is configured, if a transitive advisory can't be fixed, note it in the review and decide case by case.

Extraction recipe + report format used by the audit agent: `.claude/agents/code-review-audit.md` (Dependency-CVE advisory section).
