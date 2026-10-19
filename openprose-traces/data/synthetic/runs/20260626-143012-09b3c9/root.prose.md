---
name: livestock-health-memo
kind: system
---

# Livestock Health Memo

### Description

Turns the week's keeper notes, feeding logs, photo survey and water readings into one health memo per exhibit.

### Services

- `roster-profiler`
- `behavior-scout`
- `feeding-scout`
- `photo-scout`
- `water-scout`
- `husbandry-compiler`

### Requires

- `week_of`: the Monday that opens the week being reported
- `keeper_notes`: the keepers' free-text notes for the week, one entry per observation
- `tank_roster`: every exhibit with its species list and the ranges each tank should hold
- `photo_survey`: the week's photo survey from the gallery cameras, one set per exhibit (optional)

### Ensures

- `memo`: one section per exhibit; every flag cites its evidence; actions have owners

### Strategies

- when the photo survey is late or incomplete: let the other scouts finish, retry the photo scout once
  when the set lands, and say in the memo which photos are missing
- when an exhibit has no change: one line, not a section
