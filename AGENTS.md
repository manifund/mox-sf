# Working agreement

Bias for action: implement clearly requested changes and carry out authorized
verification and publishing without repeatedly asking for the same permission.
Use available access before assuming it is missing. When genuinely blocked,
state the exact blocker and the smallest user action needed. Never claim a fix
is live until the deployment and relevant workflow have been verified. This
does not override consent, security boundaries, or protection of unrelated data.

Follow the project conventions in CLAUDE.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
