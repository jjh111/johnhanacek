# Building the Public Stack: A Full Implementation Guide for Educational Technology Sovereignty

## For Policy Makers, District Leadership, and Legislators

---

## The Problem with Isolated Sovereignty

A single school district running its own infrastructure is good. Ten thousand districts each solving the same problems independently is wasteful. A million educators each building the same lesson plans from scratch is absurd.

Sovereignty without coordination is just expensive independence.

The goal is a system where:

- Each district controls its own stack
- Everyone benefits from everyone else's work
- Standards ensure interoperability
- No single point of control or failure

This is a solved problem in software: it's called open source. The challenge is translating it to educational governance.

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

Each level has distinct responsibilities. The principle: decide at the lowest level that can decide well, share at the highest level that maintains relevance.

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

- **Right to repair and modify:** Districts must have legal clarity that modifying open source software doesn't void warranties or violate agreements.
- **Data ownership clarity:** Student data generated on district infrastructure belongs to the district and, by extension, the community.
- **Procurement flexibility:** State and federal funding must allow open source alternatives to commercial products.

---

## State Level: Coordination and Support

### What States Provide

- **Shared infrastructure options:** A state-run cloud that districts can use if they lack local capacity, but are never required to use.
- **Training programs:** Certification pathways for IT staff in open source administration.
- **Curriculum frameworks:** Standards-aligned materials designed for open platforms.
- **Procurement cooperatives:** Bulk hardware purchasing for participating districts.

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

A federally-supported, but not federally-controlled, repository covering three domains:

**Software:**

- Reference implementations of the sovereign stack
- Security-audited builds of educational AI models
- Accessibility-verified interface components
- Deployment automation scripts

**Content:**

- Lesson plans tagged by standard, grade, and subject
- Assessment items with psychometric data
- Multimedia resources with clear licensing
- Translations and accessibility adaptations

**Data (Anonymized):**

- Model performance across demographics
- Effective prompt patterns for different learning goals
- Infrastructure cost benchmarks
- Security incident patterns and responses

### Governance Model

Not a federal agency. A cooperative structure:

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

Think of how internet standards work (IETF, W3C) rather than how federal programs usually work. Authority comes from voluntary adoption and technical credibility, not regulatory mandate.

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

- Model cards documenting training data, capabilities, and limitations
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

### Reframing EdTech Spending

Currently, federal and state edtech funding often flows through districts to vendors. The sovereign model redirects:

|Current Flow|Sovereign Flow|
|---|---|
|Grant to District to Vendor license|Grant to District to Staff, Hardware, and Cooperative dues|
|Per-seat SaaS fees|One-time infrastructure plus ongoing maintenance|
|Vendor training programs|Peer learning networks plus certification|

### Federal Funding Opportunities

**E-Rate Modernization:** Currently E-Rate covers connectivity. Expand to cover:

- Server infrastructure for local AI
- Open source deployment support
- Security auditing for sovereign systems

**Title IV-A:** Already allows technology spending. Add explicit guidance that open source infrastructure qualifies.

**New Dedicated Fund:** A "Digital Sovereignty in Education" grant program:

- Competitive grants for districts transitioning to sovereign infrastructure
- Formula funding for cooperative membership
- Research grants for effectiveness studies

### Avoiding the Reinvention Problem

Two mechanisms prevent districts from solving the same problems independently:

**Upstream First Culture:** When a district improves a tool, the improvement flows back to the shared repository. This is standard practice in open source; it needs to become standard practice in education.

**Recognition Systems:** Teachers and IT staff who contribute get credit. Professional development hours. Portfolio items. Standing in the community.

**Quality Curation:** The cooperative doesn't just host everything. It reviews, tests, and recommends. "Cooperative Certified" becomes a meaningful quality signal.

### Avoiding Fragmentation

**Reference implementations:** The cooperative maintains a default configuration that works. Districts can diverge, but there's always a known-good option to return to.

**Compatibility testing:** Automated testing ensures contributions work with the reference implementation.

**Governance that works:** Standards processes are not glamorous, but they are essential. The cooperative needs real authority to maintain coherence without becoming a bottleneck.

---

## International Dimension

### Learning from Others

Several countries have already built meaningful public digital infrastructure for education:

- Germany's digital sovereignty initiatives in public sector IT
- France's education ministry open source requirements
- Estonia's digital infrastructure model
- Brazil's long history of educational Linux deployments

These are not theoretical experiments. They are operational systems with track records.

### Cross-Border Collaboration

Educational resources don't respect borders. A math lesson is a math lesson. The cooperative model can extend internationally through:

- Reciprocal agreements with other national repositories
- Shared AI model development, especially for minority languages
- Coordinated security response
- Research collaboration

---

## Implementation Timeline

### Year 1: Foundation

- Establish cooperative legal structure
- Launch reference architecture v1.0
- Begin pilot programs in 3-5 states
- Develop initial interoperability standards

### Years 2-3: Growth

- Expand to 20+ states
- Repository reaches 10,000+ curated resources
- AI model library covers core educational use cases
- Certification program graduates first cohort

### Years 4-5: Maturity

- Sovereign infrastructure serves majority of US students
- International partnerships operational
- Standards adopted by major vendors, who will follow the market
- Research demonstrates effectiveness parity or superiority

---

## The Political Coalition

This is not a left or right issue. It is a coalition issue.

**Conservative appeal:**

- Local control over education
- Reduced dependency on large technology companies
- Fiscal responsibility through lower long-term costs
- Student data staying in community hands

**Progressive appeal:**

- Digital equity through universal access to the same tools
- Privacy protection for vulnerable students
- Democratic control of public institutions
- IT jobs that stay local

**Pragmatic appeal:**

- The math works
- The technology exists
- Other countries are doing it
- The current system isn't working

---

## Call to Action by Role

**District Superintendents:** Start a pilot. Join a cooperative. Share your results publicly.

**State Legislators:** Introduce sovereignty-friendly amendments to existing ed-tech law. Fund transition support. Pass the model legislation in this document.

**Federal Legislators:** Modernize E-Rate. Create the Digital Sovereignty in Education grant program. Charter the national cooperative.

**IT Directors:** Document your current costs honestly. Identify open source alternatives. Build your skills before you need them.

**Teachers:** Advocate for tools you can understand and modify. Contribute your materials to shared repositories. Teach students what the tools actually are.

**Parents:** Ask your school board: who owns your child's educational data? Who controls the AI your child talks to? Demand answers.

---

## Closing: The Network We Build Together

Network effects work in both directions. Right now, they concentrate value in vendor platforms. Every user makes the platform more valuable, but the platform captures that value.

In a sovereign, cooperative model, network effects serve the public. Every district that joins makes the shared resources better. Every teacher who contributes improves tools for every other teacher. Every bug fix protects every student.

This is how public infrastructure should work. We already do it for roads, for libraries, for the internet itself. The tools our children use to learn deserve the same treatment.

The network is ours to build. The sovereignty is ours to claim.

---

_Released under CC-BY-4.0. Use it, adapt it, improve it, share it back._

---

*John Hanacek · [johnhanacek.com](https://johnhanacek.com) · [Read online](https://johnhanacek.com/writing.html#eduos-implementation)*

