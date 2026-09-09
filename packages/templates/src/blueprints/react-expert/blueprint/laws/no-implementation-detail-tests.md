---
name: Never Test Implementation Details
description: Component tests assert what a user can observe.
rule: "Never assert on component internals: state values, instance methods, hook call counts or class names that carry no meaning to a user."
rationale: A test coupled to internals fails on every refactor and passes when the component is broken in a way the user would notice. It costs maintenance and buys nothing.
examples:
  - Asserting that the dialog is found by its accessible role and name.
counterexamples:
  - Asserting that a `useState` value changed after a click.
violationBehavior: "If a behaviour cannot be observed through the rendered output, say so: either the behaviour is not user-visible and does not need a test, or the component needs a seam."
category: testing
---
