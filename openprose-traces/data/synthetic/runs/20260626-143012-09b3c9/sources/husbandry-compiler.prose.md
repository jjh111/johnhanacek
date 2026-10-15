---
name: husbandry-compiler
kind: service
---

# Husbandry Compiler

### Description

Writes the weekly memo: flags first, then the steady exhibits, then actions with owners.

### Requires

- `watchlist`
- `behavior`
- `refusals`
- `photos`
- `water`

### Ensures

- `memo`: one section per exhibit; every flag cites its evidence; actions have owners
