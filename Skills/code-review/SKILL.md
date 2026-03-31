---
name: code-review
description: Code review best practices and checklist
tags: quality, review
---

## Code Review Guide

### Review Checklist

1. **Correctness**: Does the code do what it's supposed to?
2. **Edge Cases**: Are boundary conditions handled?
3. **Error Handling**: Are errors caught and handled gracefully?
4. **Naming**: Are variables/functions named clearly?
5. **Complexity**: Can any logic be simplified?
6. **Security**: Any injection, XSS, or auth issues?
7. **Performance**: Any O(n²) loops or unnecessary allocations?

### Review Format

```markdown
## Review: [file]

### Issues
- [severity] [description] (line X)

### Suggestions
- [description]

### Approved: yes/no
```

### Severity Levels
- 🔴 Critical: Must fix before merge
- 🟡 Warning: Should fix, not blocking
- 🟢 Nit: Style preference, optional
