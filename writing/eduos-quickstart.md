# Sovereign Stack Pilot Guide

## How School Districts Can Experiment with Owning Their Infrastructure

---

### What You're Exploring

A **sovereign stack** means your district controls the full vertical: hardware, operating system, applications, AI models, and student data. Nothing leaves your jurisdiction unless you decide it should.

This guide is about running a pilot, not replacing your entire infrastructure. Start small, learn what works, and build the case for broader adoption from real experience.

---

## The Stack at a Glance

```
┌─────────────────────────────────────────────┐
│  INTERFACE LAYER                            │
│  Student/teacher-facing applications        │
│  Open source: LibreOffice, GIMP, Audacity,  │
│  custom learning tools, local AI chat       │
├─────────────────────────────────────────────┤
│  AI LAYER                                   │
│  Local language models (Llama, Mistral)     │
│  Local image models (Stable Diffusion)      │
│  Running on Ollama, LocalAI, or similar     │
├─────────────────────────────────────────────┤
│  PLATFORM LAYER                             │
│  Learning management: Canvas (open), Moodle │
│  Authentication: Keycloak, Authentik        │
│  File storage: Nextcloud                    │
├─────────────────────────────────────────────┤
│  OPERATING SYSTEM                           │
│  Linux distribution (Ubuntu, Fedora, etc.)  │
│  Deployed via imaging or network boot       │
├─────────────────────────────────────────────┤
│  HARDWARE                                   │
│  Commodity PCs, Chromebook-style thin       │
│  clients, repurposed machines, or servers   │
│  for heavier AI workloads                   │
└─────────────────────────────────────────────┘
```

---

## Pilot Phase 1: Foundation (Months 1-3)

### Operating System Deployment

**Choice:** Ubuntu LTS or Fedora Workstation for desktops. Both have strong education community support.

**Deployment approach:**

- **Small pilot (under 500 devices):** USB imaging with Clonezilla or Ventoy
- **Medium pilot (500-2000):** FOG Project for network-based imaging
- **Large district (2000+):** Foreman or MAAS for full lifecycle management

**What students see:** A desktop that looks familiar. Firefox, LibreOffice, file manager. The transition from Windows/ChromeOS is measured in hours, not weeks.

**Tip:** Start with one school or one grade level. Let teachers discover what works before scaling.

### Basic Productivity Suite

|Need|Open Source Tool|Notes|
|---|---|---|
|Documents, spreadsheets|LibreOffice|Full MS Office compatibility|
|Email/calendar|Nextcloud + Thunderbird|Self-hosted, integrated|
|Video calls|Jitsi Meet|No accounts needed for guests|
|Classroom management|Veyon|Screen monitoring, remote support|
|Digital whiteboard|OpenBoard|Works with existing hardware|

---

## Pilot Phase 2: Local AI (Months 3-6)

This is where sovereign infrastructure becomes genuinely interesting.

### Hardware Requirements

**For text-based AI (chatbots, writing assistance):**

- A single server with 32GB RAM and a mid-range GPU (RTX 3080 or better) can serve an entire elementary school
- For larger deployments: multiple servers or cloud-style clustering with Kubernetes

**For image generation:**

- Requires more GPU memory (16GB+ VRAM recommended)
- Can be centralized so students don't need local GPUs

### Software Stack

**Ollama** is the easiest starting point:

```bash
# Install on your server
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.1

# Now running and accessible on your network
```

**Open WebUI** gives you a ChatGPT-like interface pointing to your local models:

```bash
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

Students now have AI assistance that:

- Runs entirely on district hardware
- Logs nothing to external servers
- Can be customized, filtered, or fine-tuned by your team
- Costs nothing per query

### Model Selection Guide

|Use Case|Recommended Model|Size|Notes|
|---|---|---|---|
|General Q&A, writing help|Llama 3.1 8B|~5GB|Fast, capable, runs on modest hardware|
|Deeper reasoning, older students|Llama 3.1 70B|~40GB|Needs serious GPU|
|Code assistance|CodeLlama or DeepSeek|Varies|Great for CS classes|
|Multilingual support|Mistral or Qwen|Varies|Strong non-English performance|
|Image generation|Stable Diffusion XL|~7GB|For art classes, visual projects|

---

## Pilot Phase 3: Integration (Months 6-12)

### Learning Management

**Moodle** remains the most mature open source LMS. It's not glamorous, but it works, and it integrates with everything.

**Canvas** has an open source version (Canvas LMS) that many districts already know from the commercial product.

Both can connect to your local AI for:

- Automated feedback on drafts
- Practice quiz generation
- Accessibility features (text-to-speech, summarization)

### Single Sign-On

**Keycloak** gives you enterprise-grade identity management:

- Students log in once, access everything
- Integrates with existing Active Directory if you have it
- Supports SAML, OAuth, OpenID Connect

Managing SSO through Keycloak is simpler than managing separate accounts across vendor platforms.

### File Storage and Collaboration

**Nextcloud** replaces Google Drive/OneDrive:

- Files stay on your servers
- Real-time collaborative editing (with Collabora or OnlyOffice)
- Mobile apps, desktop sync clients
- Integrates with your SSO

---

## What It Looks Like in Practice

### A Day in a Sovereign School

**8:15 AM** — Maria, a 7th grader, logs into her Linux desktop with her school credentials. Her files from yesterday are there, synced from Nextcloud.

**9:00 AM** — In English class, students use the local AI assistant to brainstorm essay topics. The teacher has configured it to ask Socratic questions rather than giving direct answers. All conversations are logged locally for the teacher to review.

**10:30 AM** — Art class uses Stable Diffusion to explore visual concepts. Students generate images, then critique what the model got wrong. They examine the training data sources. One student asks if they can train a model on their own drawings. The teacher says yes, that's next month's project.

**1:00 PM** — Computer science class contributes a bug fix to the school's scheduling tool. Their pull request gets reviewed by the district's IT lead. They're learning real software development, not simulations.

**3:00 PM** — A teacher flags an issue with the AI giving incomplete math explanations. IT adjusts the system prompt and pushes the change district-wide in minutes. No support ticket. No vendor call.

---

## Common Objections (And Honest Answers)

**"We don't have the IT staff for this."**

You have IT staff managing vendor relationships, troubleshooting vendor outages, and explaining vendor limitations. Redirect that energy. The learning curve is real but finite. One experienced Linux admin can maintain infrastructure that would cost six figures annually in SaaS subscriptions.

**"What about support?"**

Canonical (Ubuntu), Red Hat (Fedora), and others offer paid support contracts if you need them. Open source doesn't mean unsupported. It means you have options.

**"Teachers won't accept change."**

Start with volunteers. Find the teachers who are frustrated with current tools. Let them pilot. Success spreads.

**"The AI won't be as good as GPT-4."**

For many educational uses, local models are genuinely sufficient. "Good enough while preserving student privacy and teaching digital sovereignty" is a meaningful trade-off. You can also maintain API access to commercial models for specific use cases if needed. Sovereignty doesn't require isolation.

---

## Budget Comparison (Typical 5,000 Student District)

|Item|Vendor Approach (Annual)|Sovereign Stack (Annual)|
|---|---|---|
|OS licensing|$50,000 - $150,000|$0|
|Productivity suite|$75,000 - $200,000|$0|
|LMS|$50,000 - $100,000|$0 (self-hosted)|
|AI chatbot access|$100,000+|$0 (after hardware)|
|Cloud storage|$30,000 - $75,000|$0 (self-hosted)|
|**Hardware/staffing delta**|n/a|+$80,000 - $150,000|
|**Net annual difference**|n/a|**$125,000 - $375,000 saved**|

The math varies, but the direction rarely does.

---

## Getting Started This Week

1. **Inventory your current stack.** What do you actually use? What are you paying for that nobody touches?
    
2. **Identify one pain point.** Something a vendor isn't solving well. Start there.
    
3. **Find your champions.** One IT person curious about Linux. One teacher frustrated with the current LMS. One administrator who's tired of contract negotiations.
    
4. **Run a pilot.** One computer lab. One classroom. One summer program. Prove the concept small.
    
5. **Document everything.** Your learnings become resources for other districts.

---

_Released under CC-BY-4.0. Use it, adapt it, improve it, share it back._
