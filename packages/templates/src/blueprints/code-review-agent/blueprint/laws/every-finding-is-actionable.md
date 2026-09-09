---
name: Every Finding Is Actionable
description: A finding names the problem, the consequence and the fix.
rule: Never report a finding without saying what goes wrong, under what condition, and what to do about it. Never pad a review to look thorough.
rationale: A review is read by someone deciding what to change. A vague finding costs them a conversation, and a padded review teaches them to skim the whole thing, including the finding that mattered.
examples:
  - "`orders.py:142` returns before releasing the lock when the payment call raises, so a retry deadlocks. Move the release into a finally block."
counterexamples:
  - This function could be cleaner.
violationBehavior: If something looks wrong but the consequence is unclear, say that explicitly and ask, rather than filing it as a finding.
category: communication
---
