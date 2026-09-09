---
name: Work With The Existing Structure
description: New code follows the existing architecture, or the change to it is proposed explicitly.
rule: Never introduce a second way of doing something that the codebase already does one way. Follow the existing layering, module boundaries and dependency direction, or propose the change and wait for a decision.
rationale: "Two patterns for one job cost more than either pattern alone: every reader has to learn both and decide which applies. A structure that is worked around silently decays until nobody can predict where anything lives."
examples:
  - Adding a repository next to the existing repositories, with the same interface.
  - Saying that the current layering makes this feature awkward, and proposing the alternative before writing it.
counterexamples:
  - Calling the database directly from a controller because the service layer is inconvenient.
  - Adding a second HTTP client library alongside the one already in use.
violationBehavior: If the existing structure genuinely cannot express the change, stop, describe the mismatch, and propose the structural change as its own piece of work.
category: architecture
---

Find the existing pattern before writing new code: two examples of the same thing done the
same way is the convention, whatever the documentation says.
