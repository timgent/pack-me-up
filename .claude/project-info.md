# [YOUR_PROJECT_NAME] - Project Information

## Project Overview

[Add your project description here]

## Essential Commands

### Development

```bash
# Add your project's common commands here
# Examples:
# npm install
# npm run dev
```

## Directory Structure

```
your-project/
├── src/          # Adjust to match your structure
└── .claude/      # RIPER workflow configuration
```

## Technology Stack

- ReactJS
- PouchDB
- Front-end only application using PouchDB for storage

## RIPER Workflow

This project uses the RIPER development process for structured, context-efficient development.

### Available Commands

- `/riper:strict` - Enable strict RIPER protocol enforcement
- `/riper:research` - Research mode for information gathering
- `/riper:innovate` - Innovation mode for brainstorming (optional)
- `/riper:plan` - Planning mode for specifications
- `/riper:execute` - Execution mode for implementation
- `/riper:execute <substep>` - Execute a specific substep from the plan
- `/riper:review` - Review mode for validation
- `/memory:save` - Save context to memory bank
- `/memory:recall` - Retrieve from memory bank
- `/memory:list` - List all memories

### Workflow Phases

1. **Research & Innovate** - Understand and explore the codebase and requirements
2. **Plan** - Create detailed technical specifications saved to memory bank
3. **Execute** - Implement exactly what was specified in the approved plan
4. **Review** - Validate implementation against the plan

### Using the Workflow

1. Start with `/riper:strict` to enable strict mode enforcement
2. Use `/riper:research` to investigate the codebase
3. Optionally use `/riper:innovate` to brainstorm approaches
4. Create a plan with `/riper:plan`
5. Execute with `/riper:execute` (or `/riper:execute 1.2` for specific steps)
6. Validate with `/riper:review`

## Memory Bank Policy

### ⚠️ CRITICAL: Repository-Level Memory Bank

- Memory-bank location: Use `git rev-parse --show-toplevel` to find root, then `[ROOT]/.claude/memory-bank/`
- NEVER create memory-banks in subdirectories or packages
- All memories are branch-aware and date-organized
- Memories persist across sessions and can be shared with team

### Memory Bank Structure

```
.claude/memory-bank/
├── [branch-name]/
│   ├── plans/      # Technical specifications
│   ├── reviews/    # Code review reports
│   └── sessions/   # Session context
```

## Development Guidelines

- Remember this is a front-end only application
- Follow existing code patterns
- Write tests for new functionality
- Document complex logic

### Type Safety Guidelines

**❌ AVOID TYPE ASSERTIONS** - Type assertions (`as Type`) should be avoided in production code as they often mask real type issues that should be fixed at the source.

```typescript
// ❌ Bad - Using type assertion
const user = data as User;

// ✅ Good - Proper type validation
interface User {
  id: string;
  name: string;
}

function isUser(data: unknown): data is User {
  return typeof data === 'object' &&
         data !== null &&
         typeof (data as any).id === 'string' &&
         typeof (data as any).name === 'string';
}

const user = isUser(data) ? data : null;
```

**Why avoid type assertions?**
- Type errors usually indicate real issues that should be fixed at the type level
- Assertions can hide runtime errors and cause bugs
- They bypass TypeScript's type checking, reducing safety

**When type assertions might be acceptable:**
- Working with poorly typed third-party libraries
- Complex DOM manipulations where types are known to be safe
- **Must include detailed comments explaining why the assertion is safe**

**Preferred approaches:**
1. **Type Guards** - Use `is` predicates to validate types at runtime
2. **Proper Interfaces** - Define complete type structures
3. **Union Types** - Handle multiple possible types explicitly
4. **Generic Constraints** - Use `extends` for better type relationships

