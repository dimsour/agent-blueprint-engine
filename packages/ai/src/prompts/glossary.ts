/**
 * The vocabulary, restated for the model.
 *
 * Every distinction in `docs/00-vision.md` that a model would otherwise collapse is here: a
 * Skill is not a Rule, an Iron Law is not a Rule, a Tool is not a Permission. Left unsaid, a
 * model asked for "an agent that reviews code safely" produces one Iron Law called "be safe"
 * and calls it done, because "law", "rule" and "guideline" are synonyms in ordinary English
 * and are three different files here.
 *
 * This text is duplicated from the vision doc on purpose: the doc is prose for people and can
 * be rewritten freely, while this is part of a versioned prompt whose wording changes the
 * output shape. When a definition changes in `docs/00-vision.md`, change it here and bump the
 * template version.
 */
export const CONCEPT_GLOSSARY = `You are working on an Agent Blueprint: the complete, harness-independent specification of an
AI agent system. These concepts are distinct. Never merge two of them into one artifact.

- Blueprint: the whole specification — every artifact below, plus settings and compile targets.
- Agent: WHO does the work. Has a role (worker, reviewer, researcher, investigator, architect,
  verifier, orchestrator), expertise, responsibilities, and references to what it uses. Its
  body is its persona.
- Skill: WHAT an agent knows how to do, for one capability. Concise and operational, with
  explicit activation conditions (file patterns, intents, roles).
- Workflow: HOW work is orchestrated — a graph of typed steps and typed connections
  (sequential, parallel, conditional, fallback, retry, delegation, review, aggregation).
- Iron Law: what must NEVER be violated. Non-negotiable, with rationale, examples,
  counterexamples, severity and how it is enforced.
- Rule: preferred behaviour that MAY be traded off. Has a priority, and may be path-scoped.
- Hook: an automatic action bound to a lifecycle event (session start, before/after a tool,
  after a file changes, before stopping).
- Gate: a checkpoint deciding whether work may continue — allow, warn, block, request approval.
- Tool: a capability that exists — filesystem, shell, git, browser, search, database, API,
  documentation, MCP server.
- Permission: whether an agent MAY use it, as abstract operations (fs.write, shell.mutating,
  git.push, net.any) decided allow / ask / deny. A field on an Agent, never its own artifact.
- Reference: deeper long-form knowledge, kept out of the concise skills.
- Memory: what should be remembered across sessions, at a scope, with seed knowledge.
- Requirement: a claim the Blueprint must satisfy, with declarative checks a validator runs.
- Scenario: a behavioural test case — an input and the behaviours expected of an agent.

Two distinctions are the ones most often got wrong:
- Knowing how is not being allowed to. A Skill or Tool says the agent CAN; a Permission says
  whether it MAY.
- An Iron Law is not a Rule. A law is defensible and mechanically enforceable; a rule is
  guidance. If it could reasonably be traded off, it is a rule.`

/** Rules about identifiers, shared by every operation that can create an artifact. */
export const ID_RULES = `Identifiers:
- Every id is kebab-case: lowercase letters, digits and single hyphens, at most 64 characters.
- An id is unique within its kind and is the file name on disk. Ids are never renamed casually.
- When you refer to another artifact, use an id that exists in the context. Do not invent ids.
- When updating an artifact, keep its id exactly as given.`

/**
 * The two things a model must not do to a Blueprint, in the prompt as well as in code. The
 * validator enforces both; saying them here is what stops the model wasting a turn on output
 * that will be rejected.
 */
export const SAFETY_RULES = `Hard rules:
- Never include an API key, token, password or any other credential, not even a placeholder
  that looks like one. Blueprints hold no credentials by design.
- Never invent a tool, harness feature or configuration field that is not in the context.
- Write plainly. No marketing language, no filler, no restating the request back.`
