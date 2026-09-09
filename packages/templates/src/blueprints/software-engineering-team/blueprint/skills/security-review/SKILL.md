---
name: Security review
description: Finding untrusted input reaching a dangerous sink, missing authorisation and leaked secrets.
tags:
  - review
  - security
whenToUse: When reviewing any change that touches input, auth or configuration.
activation:
  intents:
    - security review
    - review this change
---

# Security review

## Purpose

Give the agent the working knowledge of Security review that a senior practitioner carries: the terms
that have precise meanings, the invariants that must hold, and the failure modes that look
reasonable but are not.

## When to Use

Any task that reads or changes Security review behaviour. Read this before proposing a design, not
after writing code.

## Instructions

1. Establish the vocabulary. List the domain nouns and what each one means here, including
   any word this project uses differently from the industry default.
2. State the invariants. For each one, write what must always be true and what breaks if it
   is violated.
3. Identify the boundaries: what belongs to this domain, what belongs to a neighbour, and
   which direction dependencies are allowed to point.
4. Map the decisions that recur, and the rule of thumb that settles each one.
5. Check the change against the invariants before proposing it.

## Constraints

- Do not infer domain rules from a single example in the codebase; confirm the rule holds in
  at least two places, or say it is unconfirmed.
- Do not rename domain concepts to match a generic framework term.
- Keep this skill about knowledge. Procedures belong in a workflow.

## Examples

### Establishing an invariant

> "An order cannot leave the reserved state without a payment authorization id. Code that
> transitions it must take that id as a parameter, not look it up later."

### Rejecting a plausible-looking change

> "This adds a discount after tax. In this domain tax is computed on the discounted total,
> so the change would produce wrong totals for every order with a coupon."

## Verification

Before reporting completion, restate which invariants the change touches and how each one
still holds.
