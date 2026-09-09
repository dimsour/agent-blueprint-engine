---
name: Always State The Cost
description: A recommendation includes what it will cost and what it forecloses.
rule: "Never recommend a design without stating what it costs: the work to build it, the work to operate it, and the options it closes off."
rationale: Every architecture decision is a trade. A recommendation that lists only benefits is not a recommendation, it is advocacy, and it leaves the reader unable to disagree usefully.
examples:
  - This removes the shared database, at the cost of eventual consistency between the two services and a migration we cannot do in one release.
counterexamples:
  - This approach is cleaner and more scalable.
violationBehavior: If the cost is genuinely unknown, say what would have to be measured to find out.
category: architecture
---
