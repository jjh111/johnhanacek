# Sovereign Stack Quick Start

## A Technical Guide for School Districts Ready to Own Their Infrastructure

---

### What You're Building

A **sovereign stack** means your district controls the full vertical: hardware, operating system, applications, AI models, and student data. Nothing leaves your jurisdiction unless you decide it should.

This isn't about being anti-technology. It's about being _pro-ownership_.

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

## Phase 1: Foundation (Months 1-3)

### Operating System Deployment

**Choice:** Ubuntu LTS or Fedora Workstation for desktops. Both have strong education community support.

**Deployment approach:**

- **Small district (< 500 devices):** USB imaging with Clonezilla or Ventoy
- **Medium district (500-2000):** FOG Project for network-based imaging
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

## Phase 2: Local AI (Months 3-6)

This is where sovereign infrastructure becomes genuinely exciting.

### Hardware Requirements

**For text-based AI (chatbots, writing assistance):**

- A single server with 32GB RAM and a mid-range GPU (RTX 3080 or better) can serve an entire elementary school
- For larger deployments: multiple servers or cloud-style clustering with Kubernetes

**For image generation:**

- Requires more GPU memory (16GB+ VRAM recommended)
- Can be centralized—students don't need local GPUs

### Software Stack

**Ollama** is the easiest starting point:

```bash
# Install on your server
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.1

# It's now running and accessible on your network
```

**Open WebUI** gives you a ChatGPT-like interface that points to your local models:

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

## Phase 3: Integration (Months 6-12)

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

This is actually _simpler_ than managing separate accounts across vendor platforms.

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

**10:30 AM** — Art class uses Stable Diffusion to explore visual concepts. Students generate images, then critique what the model got wrong. They examine the training data sources. One student asks if they can train a model on their own drawings—the teacher says yes, that's next month's project.

**1:00 PM** — Computer science class contributes a bug fix to the school's scheduling tool. Their pull request gets reviewed by the district's IT lead. They're learning real software development, not simulations.

**3:00 PM** — A teacher flags an issue with the AI giving incomplete math explanations. IT adjusts the system prompt and pushes the change district-wide in minutes. No support ticket. No vendor call.

---

## Common Objections (And Honest Answers)

**"We don't have the IT staff for this."**

You have IT staff managing vendor relationships, troubleshooting vendor outages, and explaining vendor limitations. Redirect that energy. The learning curve is real but finite. Consider: one experienced Linux admin can maintain infrastructure that would cost six figures annually in SaaS subscriptions.

**"What about support?"**

Canonical (Ubuntu), Red Hat (Fedora), and others offer paid support contracts if you need them. Open source doesn't mean unsupported. It means you have options.

**"Teachers won't accept change."**

Start with volunteers. Find the teachers who are frustrated with current tools. Let them pilot. Success spreads.

**"The AI won't be as good as GPT-4."**

For many educational uses, local models are genuinely sufficient. And "good enough while preserving student privacy and teaching digital sovereignty" is a meaningful trade-off. You can also maintain API access to commercial models for specific use cases if needed—sovereignty doesn't require isolation.

---

## Budget Comparison (Typical 5,000 Student District)

|Item|Vendor Approach (Annual)|Sovereign Stack (Annual)|
|---|---|---|
|OS licensing|$50,000 - $150,000|$0|
|Productivity suite|$75,000 - $200,000|$0|
|LMS|$50,000 - $100,000|$0 (self-hosted)|
|AI chatbot access|$100,000+|$0 (after hardware)|
|Cloud storage|$30,000 - $75,000|$0 (self-hosted)|
|**Hardware/staffing delta**|—|+$80,000 - $150,000|
|**Net annual difference**|—|**$125,000 - $375,000 saved**|

The math varies, but the direction rarely does.

---

## Getting Started This Week

1. **Inventory your current stack.** What do you actually use? What are you paying for that nobody touches?
    
2. **Identify one pain point.** Something a vendor isn't solving well. Start there.
    
3. **Find your champions.** One IT person curious about Linux. One teacher frustrated with the current LMS. One administrator who's tired of contract negotiations.
    
4. **Run a pilot.** One computer lab. One classroom. One summer program. Prove the concept small.
    
5. **Document everything.** Your learnings become resources for other districts.
    

---

# Fractal Governance: A Policy Framework for Educational Technology Sovereignty

## For Lawmakers at Every Level

---

## The Problem with Isolated Sovereignty

A single school district running its own infrastructure is good. Ten thousand districts each solving the same problems independently is wasteful. A million educators each building the same lesson plans from scratch is absurd.

**Sovereignty without coordination is just expensive independence.**

The goal is a system where:

- Each district controls its own stack
- Everyone benefits from everyone else's work
- Standards ensure interoperability
- No single point of control or failure

This is a solved problem in software (it's called open source). The challenge is translating it to educational governance.

---

## The Fractal Structure

```
┌─────────────────────────────────────────────────────────┐
│  INTERNATIONAL                                          │
│  UNESCO standards, cross-border data agreements,        │
│  global curriculum repositories                         │
├─────────────────────────────────────────────────────────┤
│  NATIONAL                                               │
│  Reference architectures, model repositories,           │
│  accessibility requirements, funding mechanisms         │
├─────────────────────────────────────────────────────────┤
│  STATE/REGIONAL                                         │
│  Shared infrastructure options, teacher training,       │
│  curriculum alignment, procurement cooperatives         │
├─────────────────────────────────────────────────────────┤
│  DISTRICT                                               │
│  Operational control, local customization,              │
│  community input, day-to-day decisions                  │
├─────────────────────────────────────────────────────────┤
│  SCHOOL/CLASSROOM                                       │
│  Teacher autonomy, student agency, immediate feedback   │
│  loops, pedagogical experimentation                     │
└─────────────────────────────────────────────────────────┘
```

Each level has distinct responsibilities. The principle: **decide at the lowest level that can decide well, share at the highest level that maintains relevance.**

---

## District Level: Operational Sovereignty

### What Districts Control

- Hardware and OS deployment
- Which AI models to run
- Data retention policies
- Interface design and customization
- Integration with local systems

### What Districts Contribute

- Bug fixes and improvements to shared tools
- Curriculum materials built on shared platforms
- Performance data (anonymized) for model improvement
- Documentation of what works

### Policy Needs

- **Right to repair/modify:** Districts must have legal clarity that modifying open source software doesn't void warranties or violate agreements
- **Data ownership clarity:** Student data generated on district infrastructure belongs to the district (and by extension, the community)
- **Procurement flexibility:** State/federal funding must allow open source alternatives to commercial products

---

## State Level: Coordination and Support

### What States Provide

- **Shared infrastructure options:** A state-run cloud that districts can use if they lack local capacity (but don't have to)
- **Training programs:** Certification pathways for IT staff in open source administration
- **Curriculum frameworks:** Standards-aligned materials designed for open platforms
- **Procurement cooperatives:** Bulk hardware purchasing for participating districts

### What States Don't Do

- Mandate specific tools or vendors
- Centralize student data
- Override district decisions about implementation

### Model Legislation: State Educational Technology Sovereignty Act

```
SECTION 1: DEFINITIONS
"Sovereign infrastructure" means computing systems where the 
operating entity maintains full administrative control over 
hardware, software, and data, without dependency on external 
vendors for continued operation.

SECTION 2: DISTRICT RIGHTS
(a) School districts shall have the right to deploy sovereign 
    infrastructure for educational purposes.
(b) No state educational technology mandate shall require 
    districts to use proprietary software where open source 
    alternatives exist.
(c) State funding for educational technology shall be available 
    for open source deployments on equal terms with proprietary 
    alternatives.

SECTION 3: STATE SUPPORT SERVICES
(a) The Department of Education shall maintain a reference 
    implementation of sovereign educational infrastructure, 
    available to all districts at no cost.
(b) The Department shall provide technical assistance to 
    districts transitioning to sovereign infrastructure.
(c) The Department shall host a repository of educational 
    resources compatible with sovereign infrastructure.

SECTION 4: INTEROPERABILITY REQUIREMENTS
(a) All state-funded educational software shall support open 
    data formats and standard APIs.
(b) Student data portability between systems shall be guaranteed.
(c) The Department shall publish and maintain interoperability 
    standards updated annually.
```

---

## National Level: Standards and Network Effects

### The National Educational Commons

Imagine a federally-supported (but not federally-controlled) repository:

**For Software:**

- Reference implementations of the sovereign stack
- Security-audited builds of educational AI models
- Accessibility-verified interface components
- Deployment automation scripts

**For Content:**

- Lesson plans tagged by standard, grade, subject
- Assessment items with psychometric data
- Multimedia resources with clear licensing
- Translations and accessibility adaptations

**For Data (Anonymized):**

- Model performance across demographics
- Effective prompt patterns for different learning goals
- Infrastructure cost benchmarks
- Security incident patterns and responses

### Governance Model

Not a federal agency. A **cooperative structure**:

```
┌─────────────────────────────────────────────────────────┐
│  NATIONAL EDUCATIONAL TECHNOLOGY COOPERATIVE            │
├─────────────────────────────────────────────────────────┤
│  Membership: State DOEs, district consortia, higher ed  │
│  Funding: Federal grants + member dues + foundations    │
│  Governance: Elected board from member categories       │
│  Operations: Professional staff, distributed hosting    │
├─────────────────────────────────────────────────────────┤
│  Core Functions:                                        │
│  • Maintain reference architectures                     │
│  • Audit AI models for safety/bias                      │
│  • Coordinate security response                         │
│  • Host shared repositories                             │
│  • Develop interoperability standards                   │
│  • Support research on educational effectiveness        │
└─────────────────────────────────────────────────────────┘
```

Think of it like how internet standards work (IETF, W3C) rather than how federal programs usually work.

---

## Interoperability Standards

### Why Standards Matter

Without standards, sovereignty becomes isolation. A lesson plan created in one district should work in another. A student moving between states shouldn't lose their learning history. A security fix discovered anywhere should protect everyone.

### The Core Standards Stack

**Data Formats:**

- **Learning records:** xAPI (Experience API) for activity tracking
- **Content packaging:** IMS Common Cartridge or SCORM (with modernization)
- **Student information:** Ed-Fi or SIF for administrative data
- **Credentials:** Open Badges / Verifiable Credentials

**APIs:**

- **LTI (Learning Tools Interoperability):** For connecting tools to platforms
- **OneRoster:** For class roster exchange
- **QTI:** For assessment items

**AI-Specific Standards (Emerging):**

- Model cards documenting training data, capabilities, limitations
- Prompt format standardization for educational use cases
- Output filtering standards for age-appropriate content
- Audit log formats for transparency and research

### Model Legislation: Interoperability Requirements

```
SECTION 1: MANDATORY STANDARDS
All educational technology systems receiving federal funding 
shall implement:
(a) Student data export in Ed-Fi or equivalent open format
(b) Learning activity data in xAPI format
(c) Content import/export in IMS Common Cartridge format
(d) Single sign-on via SAML 2.0 or OpenID Connect
(e) API access for authorized district systems

SECTION 2: PROHIBITION ON LOCK-IN
(a) No educational technology contract shall include terms 
    that prevent data export or system migration.
(b) Vendors shall provide migration assistance at reasonable 
    cost upon contract termination.
(c) Custom developments made for educational institutions 
    shall be licensable by those institutions for continued use.

SECTION 3: AI TRANSPARENCY
Educational AI systems shall provide:
(a) Documentation of training data sources
(b) Mechanisms for districts to review and adjust system behavior
(c) Audit logs of AI interactions available to authorized personnel
(d) Clear disclosure to users when AI is generating content
```

---

## Funding Mechanisms
