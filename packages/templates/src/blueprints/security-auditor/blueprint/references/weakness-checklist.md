---
name: Weakness Checklist
description: The classes of weakness to walk through on every audit.
kind: domain-knowledge
---

# Weakness checklist

- Injection: SQL, shell, template, header, log.
- Path handling: traversal, symlinks, unsafe archive extraction.
- Authentication: session fixation, weak reset flows, missing rate limits.
- Authorisation: missing checks, checks in the wrong layer, insecure direct object references.
- Secrets: in code, in config, in logs, in error messages, in version control history.
- Serialisation: unsafe deserialisation, prototype pollution, mass assignment.
- Transport and storage: missing TLS verification, weak or homemade cryptography.
- Dependencies: known advisories, unmaintained packages, recently added and unreviewed.
