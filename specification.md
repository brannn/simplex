---
layout: default
title: Specification
permalink: /specification/
description: Complete Simplex v0.5 specification. Landmarks, validation criteria, pillars, and the interpretation model for autonomous agent workflows.
---

<div class="spec-content" markdown="1">

# Simplex Specification

Version 0.5

<nav class="spec-toc">
  <strong>Contents</strong>
  <ul>
    <li><a href="#purpose">Purpose</a></li>
    <li><a href="#pillars">Pillars</a></li>
    <li><a href="#interpretation-model">Interpretation Model</a></li>
    <li><a href="#landmarks">Landmarks</a></li>
    <li><a href="#required-and-optional">Required and Optional</a></li>
    <li><a href="#validation-criteria">Validation Criteria</a></li>
    <li><a href="#composition">Composition</a></li>
    <li><a href="#shared-memory">Shared Memory</a></li>
    <li><a href="#version-history">Version History</a></li>
    <li><a href="#references">References</a></li>
  </ul>
</nav>

---

## Purpose {#purpose}

Simplex is a specification for describing work that autonomous agents will perform. It captures what needs to be done and how to know when it's done, without prescribing how to do it. Simplex is designed to be interpreted by large language models directly, without formal parsing.

The motivation is practical. When agents work autonomously for extended periods, they need instructions that are complete enough to act on without clarification, yet flexible enough to allow implementation choices. Simplex occupies this middle ground between natural language (too ambiguous) and programming languages (too prescriptive).

## Pillars {#pillars}

Five principles guide Simplex.

**Enforced simplicity.** Simplex refuses to support constructs that would allow specifications to become unwieldy. If something cannot be expressed simply, it must be decomposed into smaller pieces first. This is a feature, not a limitation. Complexity that cannot be decomposed is complexity that is not yet understood.

*Note: Enforcement happens through tooling, not the specification itself. A Simplex linter flags overly complex constructs (lengthy RULES blocks, excessive inputs, deep nesting) and rejects them. The specification defines what simplicity means; tooling enforces it. See the Linter Specification section.*

**Syntactic tolerance, semantic precision.** Simplex forgives formatting inconsistencies, typos, and notational variations. Agents interpret what you meant, not what you typed. However, the meaning itself must be unambiguous. If an agent would have to guess your intent, the specification is invalid. Sloppy notation is acceptable; vague meaning is not.

*Note: Semantic precision is validated through example coverage. If examples do not exercise every branch of the rules, or if examples could be satisfied by multiple conflicting interpretations, the specification is ambiguous and invalid. See Validation Criteria.*

**Testability.** Every function requires examples. These are not illustrations; they are contracts. The examples define what correct output looks like for given inputs. An agent's work is not complete until its output is consistent with the examples.

**Completeness.** A valid specification must be sufficient to generate working code without further clarification. This is what distinguishes Simplex from a prompting language. There is no back-and-forth, no "what did you mean by X?" The spec must stand alone.

**Implementation autonomy.** Simplex describes behavior and constraints, never implementation. Algorithms, data structures, and technology choices belong to agents. If a spec needs persistent storage, it says so. Whether that becomes a graph database, file system, or something else is the agent's concern. The spec neither prescribes nor cares.

## Interpretation Model {#interpretation-model}

Simplex has no formal grammar. There is no parser, no AST, no compilation step. Agents read specifications as semi-structured text and extract meaning directly.

This is intentional. A formal grammar would contradict the principle of syntactic tolerance. It would also add complexity and create failure modes. Since Simplex exists for LLM interpretation, it should be native to how LLMs work.

Instead of grammar rules, Simplex uses landmarks. Landmarks are structural markers that agents recognize and orient around. They are all-caps words followed by a colon. Content under a landmark continues until the next landmark or the end of the document.

Agents scan for landmarks, extract the content associated with each, and build understanding from there. Unrecognized landmarks are ignored rather than rejected, which provides forward compatibility as Simplex evolves.

## Landmarks {#landmarks}

Simplex defines sixteen landmarks. Five describe structure. Eleven describe functions.

### Structural Landmarks

**DATA** defines the shape of a type. It names a concept and lists its fields with descriptions and constraints. DATA blocks help agents understand what they are working with, but they are optional. If a function's inputs and outputs are clear from context, explicit DATA definitions are unnecessary.

```
DATA: PolicyRule
  id: string, unique, format "XXX-NNN"
  rule: string, the policy statement
  severity: critical | warning | info
  tags: list of strings
  example_violation: string, optional
  example_fix: string, optional
```

**CONSTRAINT** states an invariant that must hold. Unlike function-specific rules, constraints apply broadly. They describe conditions that should never be violated, regardless of which function is executing.

```
CONSTRAINT: policy_ids_must_exist
  any policy ID referenced anywhere must exist in the registry
```

**FUNCTION** introduces a unit of work. It names an operation, lists its inputs, and declares its return type. The function block contains nested landmarks that specify behavior, completion criteria, and test cases.

```
FUNCTION: filter_policies(policies, ids, tags) → filtered list
```

**BASELINE** declares evolutionary context for a function. It establishes what currently exists, what must be preserved during evolution, and what is being evolved. BASELINE is optional; when absent, the function is treated as greenfield.

```
BASELINE:
  reference: "current session-based authentication"
  preserve:
    - existing login API contract
    - session timeout behavior (30 minutes)
  evolve:
    - authentication mechanism (target: JWT-based)
```

BASELINE contains three fields when present: **reference** (the prior state being evolved from), **preserve** (behaviors that must remain unchanged), and **evolve** (capabilities being added or changed).

**EVAL** declares how to grade preservation and evolution when BASELINE is present. It specifies thresholds using pass^k notation (all k trials must pass, for regression testing) and pass@k notation (at least one of k trials must pass, for capability testing).

```
EVAL:
  preserve: pass^3
  evolve: pass@5
  grading: code
```

EVAL contains three fields: **preserve** threshold, **evolve** threshold, and **grading** approach (code, model, or outcome). EVAL is required when BASELINE is present.

### Function Landmarks

These landmarks appear within a FUNCTION block.

**RULES** describes what the function does. This is behavioral specification: given these inputs, what should happen? Rules are prose, not pseudocode. They describe outcomes, not steps.

```
RULES:
  - if neither ids nor tags provided, return all policies
  - if only ids provided, return policies matching those IDs
  - if only tags provided, return policies with at least one matching tag
  - if both provided, return union of matches, deduplicated
```

**DONE_WHEN** states how an agent knows the work is complete. These are observable criteria, not implementation details. An agent checks these conditions to determine whether to stop or continue.

```
DONE_WHEN:
  - returned list contains exactly the policies matching criteria
  - no duplicates in returned list
```

**EXAMPLES** provides concrete input-output pairs. These are mandatory. They serve as test cases, ground truth, and clarification of intent. If the rules are ambiguous, the examples disambiguate.

Examples must satisfy coverage criteria:
- Every conditional branch in RULES must have at least one example exercising it
- If a rule uses "or," "optionally," or other alternation, examples must show each path
- If the same set of examples could be produced by multiple conflicting interpretations of the rules, the specification is ambiguous

```
EXAMPLES:
  ([p1, p2, p3], none, none) → [p1, p2, p3]          # neither ids nor tags
  ([p1, p2, p3], [p1.id], none) → [p1]               # only ids
  ([p1, p2, p3], none, [python]) → matches with tag  # only tags
  ([p1, p2, p3], [p1.id], [python]) → union          # both provided
```

**ERRORS** specifies what to do when things go wrong. It maps conditions to responses. This landmark is required. At minimum, it must specify default failure behavior.

A valid minimal ERRORS block:

```
ERRORS:
  - any unhandled condition → fail with descriptive message
```

A more complete ERRORS block:

```
ERRORS:
  - policy ID not found → fail with "unknown policy ID: {id}"
  - invalid YAML syntax → fail with "parse error: {details}"
  - any unhandled condition → fail with descriptive message
```

The requirement ensures agents never silently swallow failures during long-running autonomous execution.

**READS** declares what shared memory this function consumes. When agents coordinate through shared state, this landmark makes dependencies explicit.

```
READS:
  - SharedMemory.artifacts["registry_path"]
  - SharedMemory.status["validation_complete"]
```

**WRITES** declares what shared memory this function produces. Together with READS, this allows agents to understand data flow without central orchestration.

```
WRITES:
  - SharedMemory.artifacts["compiled_agents"]
  - SharedMemory.status["compilation"] = success | failure
```

**TRIGGERS** states conditions under which an agent should pick up this work. In swarm architectures where agents poll for available work, triggers help them decide what to do next.

```
TRIGGERS:
  - SharedMemory.artifacts["registry_path"] exists
  - SharedMemory.status["compilation"] != success
```

**NOT_ALLOWED** establishes boundaries. It states what the function must not do, even if it might seem reasonable. Use this sparingly; over-constraining defeats the purpose of implementation opacity.

```
NOT_ALLOWED:
  - modify source files
  - skip invalid entries silently
  - generate partial output on error
```

**HANDOFF** describes what passes to the next stage. On success, what does the receiving agent get? On failure, what information helps with recovery or escalation?

```
HANDOFF:
  - on success: CompiledArtifacts ready for write_artifacts
  - on failure: error message with file and line number
```

**UNCERTAIN** declares conditions under which an agent should signal low confidence rather than proceeding silently. This provides a structured way to handle ambiguity in long-running autonomous workflows.

```
UNCERTAIN:
  - if input format doesn't match any documented pattern → log warning and attempt best-effort parse
  - if multiple valid interpretations exist → pause and request clarification
  - if output would affect more than 100 files → require confirmation before proceeding
```

When UNCERTAIN is absent, agents proceed with best judgment and do not pause. When present, it defines explicit thresholds for caution.

UNCERTAIN does not violate the completeness pillar. The specification remains complete. It simply acknowledges that real-world inputs may fall outside documented cases and provides guidance for those situations.

**DETERMINISM** declares output variance requirements for a function. When agents run the same specification multiple times, should outputs be identical, structurally equivalent, or semantically equivalent?

```
DETERMINISM:
  level: strict | structural | semantic
  seed: optional seed value or "from_input"
  vary: fields allowed to vary
  stable: fields that must be identical across runs
```

DETERMINISM contains one required field (**level**) and three optional fields. The level values:
- **strict**: Identical outputs for identical inputs. No variance permitted.
- **structural**: Same semantic content, but structural details (ordering, formatting) may vary.
- **semantic**: Outputs must be semantically equivalent but may differ in expression.

When DETERMINISM is absent, agents use best judgment about output consistency. When present, it provides explicit guidance for reproducibility requirements.

## Required and Optional {#required-and-optional}

Of the sixteen landmarks, five are always required for a valid specification.

**FUNCTION** is required because without it there is no work to describe.

**RULES** is required because without it there is no behavior.

**DONE_WHEN** is required because without it agents cannot know when to stop.

**EXAMPLES** is required because without them there is no ground truth.

**ERRORS** is required because without it agents may fail silently during autonomous execution.

**EVAL** is conditionally required: when BASELINE is present, EVAL must also be present. This ensures evolutionary specifications always declare how preservation and evolution will be measured.

Everything else is optional. A minimal valid spec consists of a function with rules, completion criteria, examples, and error handling. The optional landmarks add precision when needed, but their absence does not invalidate a spec.

## Validation Criteria {#validation-criteria}

A specification is valid if it passes structural and semantic validation.

### Structural Validation

- At least one FUNCTION block exists
- Every FUNCTION contains RULES, DONE_WHEN, EXAMPLES, and ERRORS
- DATA types referenced in FUNCTION signatures are defined or obvious from context
- CONSTRAINT blocks state verifiable invariants

### Semantic Validation

Semantic validation ensures the specification is unambiguous.

**Example coverage.** Every conditional path in RULES must be exercised by at least one example.

- Count the branches: "if X" is one branch; "if X or Y" is two branches; "if X, else Y" is two branches
- Each branch needs at least one example demonstrating it
- Missing coverage is a validation error

**Interpretation uniqueness.** The examples must not be satisfiable by conflicting interpretations.

- If an agent could imagine two different implementations that both pass all examples but would behave differently on some unstated input, the specification is ambiguous
- This is a heuristic, not a formal proof. Agents should flag suspected ambiguity

**Observable completion.** DONE_WHEN criteria must be checkable from outside the function.

- "Internal state is consistent" is not observable—invalid
- "Output contains no duplicates" is observable—valid
- "All items processed" is observable only if processing produces visible evidence—clarify

**Behavioral rules.** RULES must describe outcomes, not procedures.

- "Loop through items and check each" is procedural—invalid
- "All items matching criteria are included in output" is behavioral—valid

### Determinism Validation

When DETERMINISM is present:

- **level** field is required and must be one of: strict, structural, or semantic
- Optional fields: seed, vary, stable
- If level is "strict" and vary is specified, that's a contradiction (warning)

## Composition {#composition}

Simplex does not have a composition construct. There is no way to formally specify that one function calls another, or that functions must execute in a particular order.

**Design Note:** This is intentional and represents a research hypothesis. Simplex is designed for autonomous agent workflows where agents operate over extended periods. The hypothesis is that agents can infer task dependencies and decomposition from context, potentially discovering structures the specification author did not anticipate. Prescribed composition would constrain this emergent behavior.

If a spec author wants to suggest relationships between functions, they can:
- Use READS/WRITES to show data dependencies
- Use TRIGGERS to show activation conditions
- Write prose in HANDOFF describing what the next stage expects

But Simplex does not enforce ordering. Agents determine sequencing based on their understanding of the full specification.

This design choice is experimental. Future versions may revisit it based on empirical results from autonomous agent research.

## Shared Memory {#shared-memory}

When agents coordinate through shared state (a knowledge graph, a key-value store, a file system), the READS, WRITES, and TRIGGERS landmarks describe interaction patterns.

However, Simplex does not define what shared memory is or how it works. It only provides landmarks for describing contracts against it. The implementation of shared memory is an agent concern.

A specification might say:

```
READS:
  - SharedMemory.knowledge_graph (policy relationships)

WRITES:
  - SharedMemory.artifacts["compiled_output"]
```

Whether SharedMemory is a graph database, a Redis instance, or a directory of JSON files is not the spec's concern. The contract is that something called SharedMemory exists, supports these operations, and agents can rely on it.

## Version History {#version-history}

**v0.5** — Current version. Consolidated pillars from six to five. Added DETERMINISM landmark for output variance control (strict/structural/semantic levels). Enhanced DATA and CONSTRAINT semantics. Added linter support for new landmarks.

**v0.4** — Added BASELINE and EVAL landmarks for evolutionary specifications. BASELINE declares what to preserve and evolve relative to a reference state. EVAL declares grading approach and consistency thresholds using pass^k (all trials must pass) and pass@k (at least one trial must pass) notation. These landmarks address agent failure modes in long-horizon software evolution scenarios. EVAL is required when BASELINE is present.

*v0.4 landmark additions informed by SWE-EVO research [1].*

**v0.3** — Made ERRORS required. Added UNCERTAIN landmark for confidence signaling. Added Validation Criteria section with semantic ambiguity detection. Added Linter Specification. Clarified that composition absence is an intentional research hypothesis. Updated meta-specification for new requirements.

**v0.2** — Established pillars, landmarks, interpretation model, and meta-specification.

**v0.1** — Initial exploration. Identified need for specification targeting autonomous agents.

## References {#references}

[1] Y. Liu et al., "SWE-EVO: Benchmarking Coding Agents in Long-Horizon Software Evolution Scenarios," arXiv:2512.18470, December 2025. https://arxiv.org/abs/2512.18470

</div>
