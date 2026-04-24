---
name: atomic-commits
description: Commit current work with standardized message format (atomic commits, english messages, no push)
---

# Atomic Commits

## Instructions
- Group changes logically: one commit equals one distinct intention.
- Stage selectively using git add <file> or git add -p to isolate specific modifications.
- Commit underlying dependencies before the services that rely on them.
- Write concise commit messages in English following the exact structure: type(scope): description.
- Allowed types: feat (new feature), fix (bugfix), refactor (code change without behavioral change), chore (config, scripts).
- do NOT execute git push unless the user explicitly requests it.

## Examples
- feat(db): replace_project_document_chunks and delete for chunks
- fix(embedding): retry 429 with exponential backoff
