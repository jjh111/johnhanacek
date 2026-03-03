# John Hanacek Website Optimization v2
## Based on Actual HTML Analysis

---

## 🎯 GOOD NEWS: Your Site Is Already Well-Positioned

After reviewing your actual HTML files, your site is **much stronger** than external searches suggested:

### What's Already Working:
- ✅ **Meta description** already says: "Building AI-native products, spatial computing interfaces, and agentic systems"
- ✅ **JSON-LD structured data** includes "Agentic systems", "Multi-agent workflow design", "MetaMedium concepts", "Earth Star research framework"
- ✅ **About section** explicitly mentions MetaMedium and Earth Star with OpenClaw
- ✅ **Services page** lists "AI & Agentic Systems" as a core offering
- ✅ **Interactive fish minigame** in hero is a perfect MetaMedium demonstration (and getting good responses!)
- ✅ **Kevin Kelly quote** on index is *extremely* valuable for credibility

The foundation is solid. What follows are refinements, not rebuilds.

---

## 📍 YOUR SPECIFIC QUESTIONS ANSWERED

### 1. "Should quotes move to index?"

**Recommendation: Add 1-2 strategic quotes to index, keep full testimonials on Services**

**Current state:**
- Index has: Kevin Kelly, Inga Petryaevskaya (short)
- Services has: Sheila Zipfel, Tommy Kronmark, Inga, Ben Reed, Dr. Hurriyet Ok, Kevin Kelly

**What to add to index:**

The **Sheila Zipfel quote** should be on index. Here's why:
> "He's not only a true Visionary, but also an amazing listener with incredible intuition. I've never seen anyone able to so readily understand scientists, then design an experience they can scarcely imagine, but recognize as what they wanted."

This quote:
- Demonstrates deep collaboration ability
- Shows you can translate between technical and experiential
- Comes from a Product Manager (signals you work well cross-functionally)
- Mentions "design an experience they can scarcely imagine" — MetaMedium in action

**Placement suggestion:** Add to the "I Believe" section or create a small testimonial highlight between About and Projects.

**The Kevin Kelly quote is perfect where it is** — it's aspirational and establishes credibility immediately.

**Don't move:** Tommy Kronmark's quote is about workshops specifically — better on Services where someone is evaluating hiring you.

---

### 2. "How to make me more visible if GitHub Pages isn't quite right?"

**Short answer:** GitHub Pages is fine for hosting. The visibility issue isn't the platform — it's **discoverability and content velocity**.

#### Option A: Keep GitHub Pages + Add These Layers

**For LLM/AI Discoverability (the "new SEO"):**

1. **Your JSON-LD is already excellent** — just ensure it's linked from every page:
   ```html
   <link rel="alternate" type="application/json" href="./john-hanacek.json" title="Structured data">
   ```
   ✅ Already present on index. Add to all pages.

2. **Add an llms.txt file** (emerging standard for AI crawlers):
   ```
   /llms.txt

   # John Hanacek - Agentic Design Engineer

   ## Who I Am
   Founding designer and design engineer specializing in AI-native products,
   agentic systems, and metamedium tools. I build AND design AI agents.

   ## Core Expertise
   - Agentic Design Engineering
   - MetaMedium / Tools for Thought
   - Earth Star Framework (regenerative AI systems)
   - Spatial Computing (XR/VR)
   - 0→1 Product Development

   ## Services
   - Founding Designer engagements
   - AI agent system design
   - Technical workshops
   - Rapid prototyping sprints

   ## Contact
   hi@johnhanacek.com
   https://calendar.app.google/gpSXKWuwxrGZ2HweA

   ## Structured Data
   See /john-hanacek.json for full schema.org data
   ```

3. **Add a /now page** (popular in indie/creator web):
   - What you're currently working on
   - Recent thinking
   - Updates more frequently than main pages
   - LLMs and humans both benefit from temporal signals

**For Traditional Discoverability:**

4. **Substack or similar for content velocity:**
   - GitHub Pages is static — you need a content stream
   - Your Substack (Spatial and Immersive Design) exists but could be evolved
   - Consider a "MetaMedium Dispatches" series
   - Cross-post to LinkedIn for algorithm reach

5. **Domain considerations:**
   - johnhanacek.com ✅ (professional, memorable)
   - metamedium.design or metamedium.tools (if you want MetaMedium to have its own presence beyond the demo)
   - earthstar.space (you mentioned this — good for the framework)

#### Option B: Alternative Hosting (If You Want More)

| Platform | Pros | Cons |
|----------|------|------|
| **GitHub Pages** (current) | Free, version controlled, developer credibility | Static, no CMS |
| **Vercel** | Free tier, faster CDN, analytics built-in | Slight learning curve |
| **Cloudflare Pages** | Free, fastest CDN, better bot handling | Similar to Vercel |
| **Framer** | Visual editing, good for portfolios | Monthly cost, less control |

**My recommendation:** Stay on GitHub Pages, add Vercel or Cloudflare for CDN/analytics if needed. Your content velocity problem is solved by writing elsewhere (Substack, LinkedIn), not by changing hosts.

---

### 3. "MetaMedium should stay as its own repo — how to integrate?"

**Perfect approach.** Here's how to connect them:

#### On johnhanacek.com:

**Current state (in your About section):**
> "Exploring MetaMedium concepts — tools that think alongside us"

**Enhancement — add a dedicated MetaMedium highlight:**

```html
<!-- Add to index.html, perhaps after the "I Believe" section -->
<section id="metamedium-highlight">
    <h2>MetaMedium</h2>
    <p>I'm developing open-source tools for thought — computational environments
    that augment human thinking rather than replace it. In the tradition of
    Engelbart, Kay, and Victor.</p>

    <div class="metamedium-links">
        <a href="https://jjh111.github.io/MetaMedium/" target="_blank" rel="noopener">
            → Explore the Demo
        </a>
        <a href="https://github.com/jjh111/MetaMedium" target="_blank" rel="noopener">
            → View Source on GitHub
        </a>
    </div>
</section>
```

**Why this works:**
- Links to demo (engagement)
- Links to GitHub (open source credibility)
- Keeps repos separate
- Establishes you as a builder, not just a talker

#### On the MetaMedium repo:

Add to MetaMedium's README:
```markdown
## About the Creator

MetaMedium is developed by [John Hanacek](https://johnhanacek.com),
an agentic design engineer exploring tools for thought, spatial computing,
and regenerative AI systems.

For consulting or collaboration: [hi@johnhanacek.com](mailto:hi@johnhanacek.com)
```

**This creates a bidirectional relationship** — people finding MetaMedium discover you, people finding you discover MetaMedium.

#### Cross-promotion pattern:

```
johnhanacek.com ←→ MetaMedium repo
       ↓                 ↓
   (your work)     (open source)
       ↓                 ↓
earthstar.space ←── OpenClaw research
```

---

## 🔧 SPECIFIC CODE CHANGES

### 1. Add Sheila Zipfel quote to index.html

Find the testimonial section (around line 140+) and add:

```html
<div class="content-card endorsement">
    <p>"He's not only a true Visionary, but also an amazing listener with
    incredible intuition. I've never seen anyone able to so readily understand
    scientists, then design an experience they can scarcely imagine, but
    recognize as what they wanted."</p>
    <cite><strong>Sheila Zipfel</strong>, Product Manager, Nanome</cite>
</div>
```

### 2. Create /llms.txt

New file at root:
```
# John Hanacek - Agentic Design Engineer

## Summary
Founding designer and design engineer building AI-native products, agentic
systems, and metamedium tools. Background in spatial computing (Nanome, BadVR),
now focused on tools for thought and emergent AI systems.

## Expertise
- Agentic Design Engineering (building AND designing AI agents)
- MetaMedium / Tools for Thought (Engelbart, Kay, Victor lineage)
- Earth Star Framework (regenerative AI, anti-entropy systems)
- Spatial Computing & XR
- 0→1 Product Development

## Current Focus
- Multi-agent orchestration design
- LLM integration and prompt engineering
- Open-source tools for thought (MetaMedium project)
- Earth Star research via OpenClaw

## Services Available
- Founding Designer engagements (0→1)
- AI agent system design
- Technical workshops & prototyping sprints
- Product strategy & leadership

## Links
- Portfolio: https://johnhanacek.com
- MetaMedium Demo: https://jjh111.github.io/MetaMedium/
- GitHub: https://github.com/jjh111
- LinkedIn: https://linkedin.com/in/johnhanacek
- Contact: hi@johnhanacek.com
- Book a Call: https://calendar.app.google/gpSXKWuwxrGZ2HweA

## Structured Data
Full schema.org data: https://johnhanacek.com/john-hanacek.json
```

### 3. Add MetaMedium section to index.html

```html
<section id="metamedium">
    <h2>MetaMedium</h2>
    <div class="content-card">
        <p>I'm building open-source <strong>tools for thought</strong> —
        computational environments that augment human thinking. Following
        the lineage of Engelbart, Kay, and Victor.</p>
        <p class="project-links">
            <a href="https://jjh111.github.io/MetaMedium/" target="_blank" rel="noopener" class="btn-primary">
                Explore the Demo →
            </a>
            <a href="https://github.com/jjh111/MetaMedium" target="_blank" rel="noopener" class="btn-secondary">
                View Source
            </a>
        </p>
    </div>
</section>
```

### 4. Update JSON-LD to include MetaMedium project

In john-hanacek.json, add to the mainEntity:

```json
"owns": {
    "@type": "SoftwareSourceCode",
    "name": "MetaMedium",
    "description": "Open-source tools for thought - computational environments that augment human thinking",
    "url": "https://jjh111.github.io/MetaMedium/",
    "codeRepository": "https://github.com/jjh111/MetaMedium",
    "programmingLanguage": ["JavaScript", "HTML", "CSS"],
    "license": "MIT"
}
```

---

## 📊 VISIBILITY STRATEGY SUMMARY

| Channel | Purpose | Frequency |
|---------|---------|-----------|
| **johnhanacek.com** | Portfolio, credibility, conversion | Update quarterly |
| **MetaMedium repo** | Open source credibility, technical showcase | Active development |
| **LinkedIn** | Professional network, algorithm reach | 2-3x/week posts |
| **Substack** | Long-form thinking, email list | 1-2x/month |
| **San Diego meetups** | Local network, speaking opps | 1-2x/month |
| **GitHub activity** | Developer credibility signal | Ongoing |

---

## ✅ ACTION ITEMS

### Immediate (This Week)
1. [ ] Add Sheila Zipfel quote to index.html
2. [ ] Create llms.txt file at root
3. [ ] Add MetaMedium highlight section to index
4. [ ] Ensure JSON-LD link is on all pages

### This Month
5. [ ] Add `owns` property to john-hanacek.json for MetaMedium
6. [ ] Create /now page with current focus
7. [ ] Write first "MetaMedium Dispatch" post for Substack/LinkedIn
8. [ ] Update MetaMedium README with link back to main site

### This Quarter
9. [ ] Speak at SD AI Developers meetup (creates content, backlinks)
10. [ ] Get featured on a podcast or newsletter (Lenny's? Tools for Thought community?)
11. [ ] Contribute to MCP or agent-related open source (visibility in right communities)

---

## 💡 KEY INSIGHT

Your website is already **well-structured for AI discoverability** — the JSON-LD is comprehensive, the meta descriptions are accurate, and the content reflects your actual direction.

The gap isn't the website itself. It's:
1. **Content velocity** — you need more frequent signals (posts, updates, commits)
2. **Cross-linking** — MetaMedium ↔ main site ↔ Earth Star should reference each other
3. **Community presence** — speaking, posting, contributing to make search/AI find you

The fish minigame is brilliant — it's a MetaMedium proof-of-concept right in your hero. Keep that energy.

---

*Website Optimization v2 — February 2026*
*Based on actual HTML analysis*
