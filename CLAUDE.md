# CLAUDE.md

## Testing
Use TDD (red-green-refactor) when implementing new features.
Run tests: `npm test`

## GitHub access
Do NOT use the `gh` CLI — it is not authenticated in this environment.
Use the GitHub MCP tools (`mcp__github__*`) for all GitHub operations (listing issues, adding labels, reading issues, etc.).
These tools are deferred: at the start of any session that needs GitHub access, fetch them immediately with:
  ToolSearch query: `select:mcp__github__list_issues,mcp__github__issue_write,mcp__github__issue_read`
