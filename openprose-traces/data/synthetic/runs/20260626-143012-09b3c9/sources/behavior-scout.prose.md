---
name: behavior-scout
kind: service
---

# Behavior Scout

### Description

Reads the keeper notes for changes in behaviour: hiding, appetite, aggression.

### Requires

- `keeper_notes`
- `watchlist`

### Ensures

- `behavior`: behaviour changes per exhibit, each with the note it came from
