# Search Commands — Intent Router + Action Surface
*Status: Planned | Priority: 3 | Depends on: SEARCH_OVERLAY, SEARCH_ENRICHMENT*

## Context
The search input becomes more than search — it's an intent router. Certain queries trigger specialized response cards with CTAs for services, contact, and scheduling, turning the overlay into a lightweight command surface.

## Intent Categories

### 1. Services Intent
**Triggers:** "I need help with X", "can you help me design Y", "looking for a designer", "how much do you charge"
**Response:** Personalized service recommendation card + CTA button to schedule intro call + link to services page

### 2. Contact Intent
**Triggers:** "send him a message", "how do I reach John", "email him", "contact"
**Response:** Contact card with channel links (Email, LinkedIn, Bluesky)

### 3. Schedule Intent
**Triggers:** "schedule a call", "book a meeting", "availability"
**Response:** Scheduling card with booking link + fallback email link

## Implementation

### Intent Detection Layer (runs BEFORE BM25)
```js
const INTENT_PATTERNS = [
    { intent: 'services', patterns: [...], handler: 'handleServicesIntent' },
    { intent: 'contact', patterns: [...], handler: 'handleContactIntent' },
    { intent: 'schedule', patterns: [...], handler: 'handleScheduleIntent' },
];

function detectIntent(query) {
    for (const { intent, patterns, handler } of INTENT_PATTERNS) {
        for (const p of patterns) {
            if (p.test(query)) return { intent, handler };
        }
    }
    return null;
}
```

### Intent Cards
Gold-accented cards with CTA buttons, displayed above normal search results:
```css
.intent-card {
    background: rgba(212, 175, 55, 0.04);
    border: 1px solid rgba(212, 175, 55, 0.2);
    border-radius: 6px;
    padding: 1rem 1.2rem;
}
.intent-cta {
    background: var(--gold);
    color: var(--sea-deep);
    font-family: 'Raleway', sans-serif;
    padding: 0.5rem 1.2rem;
    border-radius: 4px;
}
```

### AI-Enhanced Services Response
When AI engine available, the services intent uses LLM to craft a personalized recommendation based on what the user said they need help with. Falls back to static card when no AI.

## Files to Modify
- `scripts/search-overlay.js` — add intent detection + handlers + card rendering
- `scripts/search-overlay.css` — intent card styles

## Verification
1. "I need help with AI product design" → services intent card with CTA
2. "how do I contact John" → contact card with email/LinkedIn/Bluesky
3. "book a call" → schedule card with booking link
4. "what are his skills" → normal search (no intent triggered)
5. Intent + AI: personalized recommendation when engine available
6. No AI: static card with generic CTA still works
