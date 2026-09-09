---
name: Never Swallow Exceptions
description: An error is handled meaningfully or allowed to propagate; it is never discarded.
rule: "Never write a bare `except:` or an `except Exception: pass`. Catch the exception you can handle, and let the rest propagate."
rationale: A swallowed error turns a loud failure into a silent wrong answer, which is discovered later, further from the cause, by someone with less context. The empty catch block is the single cheapest way to make a system unmaintainable.
examples:
  - Catching a parse error, logging the input and the reason, and returning a typed failure.
  - Letting an unexpected error propagate rather than converting it into a default value.
counterexamples:
  - catch { } with a comment saying "should not happen".
  - Returning null when a lookup fails, with no way for the caller to tell "missing" from "broken".
violationBehavior: If an error genuinely can be ignored, say why in a comment at the catch site, and log it at least once. "Ignored deliberately" must be visible in the code.
category: reliability
---

Retrying counts as handling only when the operation is safe to repeat and the retry is
bounded. An unbounded retry around an error you did not diagnose is a silence with extra
steps.
