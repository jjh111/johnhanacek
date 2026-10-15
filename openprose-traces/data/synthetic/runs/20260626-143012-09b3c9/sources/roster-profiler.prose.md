---
name: roster-profiler
kind: service
---

# Roster Profiler

### Description

Reads the roster and last week's memo and decides what to look at first.

### Requires

- `tank_roster`
- `week_of`

### Ensures

- `watchlist`: a watchlist of exhibits, with the reason each is on it
