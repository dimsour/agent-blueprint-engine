---
name: Component Patterns
description: Longer-form notes on composition, state placement and data fetching boundaries.
kind: domain-knowledge
---

# Component patterns

## State placement

Keep state in the lowest component that needs it. Lift it only when a sibling needs the same value, and reach for context only when passing it would cross more than two levels that do not care about it.

## Composition over configuration

A component with more than about five boolean props is usually two components. Prefer children and slots to flags.

## Data fetching

Fetch at a route or container boundary, not inside a leaf. A leaf that fetches cannot be reused or tested without a network stub.
