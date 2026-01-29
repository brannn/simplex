# Simplex

A specification for autonomous agents.

Version 0.3

---

## Purpose

Simplex is a specification for describing work that autonomous agents will perform. It captures what needs to be done and how to know when it's done, without prescribing how to do it. Simplex is designed to be interpreted by large language models directly, without formal parsing.

The motivation is practical. When agents work autonomously for extended periods, they need instructions that are complete enough to act on without clarification, yet flexible enough to allow implementation choices. Simplex occupies this middle ground between natural language (too ambiguous) and programming languages (too prescriptive).

---

## Pillars

Five principles guide Simplex.

**Enforced simplicity.** Simplex refuses to support constructs that would allow specifications to become unwieldy. If something cannot be expressed simply, it must be decomposed into smaller pieces first. This is a feature, not a limitation. Complexity that cannot be decomposed is complexity that is not yet understood.

*Note: Enforcement happens through tooling, not the specification itself. A Simplex linter flags overly complex constructs—lengthy RULES blocks, excessive inputs, deep nesting—and rejects them. The specification defines what simplicity means; tooling enforces it. See the Linter Specification section.*

**Syntactic tolerance, semantic precision.** Simplex allows for formatting inconsistencies, typos, and notational variations. Agents interpret what you meant, not what you typed. However, the meaning itself must be unambiguous. If an agent would have to guess your intent, the specification is invalid. Sloppy notation is acceptable; vague meaning is not.

*Note: Semantic precision is validated through example coverage. If examples do not exercise every branch of the rules, or if examples could be satisfied by multiple conflicting interpretations, the specification is ambiguous and invalid. See Validation Criteria.*

**Testability.** Every function requires examples. These are not illustrations; they are contracts. The examples define what correct output looks like for given inputs. An agent's work is not complete until its output is consistent with the examples.

**Completeness.** A valid specification must be sufficient to generate working code without further clarification. This is what distinguishes Simplex from a prompting language. There is no back-and-forth, no "what did you mean by X?" The spec must stand alone.

**Implementation autonomy.** Simplex describes behavior and constraints, never implementation. Algorithms, data structures, and technology choices belong to agents. If a spec needs persistent storage, it says so. Whether that becomes a graph database, file system, or something else is the agent's concern. The spec neither prescribes nor cares.

---

## Interpretation Model

Simplex has no formal grammar. There is no parser, no AST, no compilation step. Agents read specifications as semi-structured text and extract meaning directly.

This is intentional. A formal grammar would contradict the principle of syntactic tolerance. It would also add complexity and create failure modes. Since Simplex exists for LLM interpretation, it should be native to how LLMs work.

Instead of grammar rules, Simplex uses landmarks. Landmarks are structural markers that agents recognize and orient around. They are all-caps words followed by a colon. Content under a landmark continues until the next landmark or the end of the document.

Agents scan for landmarks, extract the content associated with each, and build understanding from there. Unrecognized landmarks are ignored rather than rejected, which provides forward compatibility as Simplex evolves.

---

## Landmarks

Simplex defines thirteen landmarks. Three describe structure. Ten describe functions.

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

UNCERTAIN does not violate the completeness pillar. The specification remains complete—it simply acknowledges that real-world inputs may fall outside documented cases and provides guidance for those situations.

---

## Required and Optional

Of the thirteen landmarks, five are required for a valid specification.

**FUNCTION** is required because without it there is no work to describe.

**RULES** is required because without it there is no behavior.

**DONE_WHEN** is required because without it agents cannot know when to stop.

**EXAMPLES** is required because without them there is no ground truth.

**ERRORS** is required because without it agents may fail silently during autonomous execution.

Everything else is optional. A minimal valid spec consists of a function with rules, completion criteria, examples, and error handling. The optional landmarks add precision when needed, but their absence does not invalidate a spec.

DATA is optional to define. But when a function's return type references a DATA block, conformance is required—the choice to use DATA is optional, the obligation to conform is not.

---

## Validation Criteria

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
- This is a heuristic, not a formal proof—agents should flag suspected ambiguity

**Observable completion.** DONE_WHEN criteria must be checkable from outside the function.

- "Internal state is consistent" is not observable—invalid
- "Output contains no duplicates" is observable—valid
- "All items processed" is observable only if processing produces visible evidence—clarify

**Behavioral rules.** RULES must describe outcomes, not procedures.

- "Loop through items and check each" is procedural—invalid
- "All items matching criteria are included in output" is behavioral—valid

---

## Composition

Simplex does not have a composition construct. There is no way to formally specify that one function calls another, or that functions must execute in a particular order.

**Design Note:** This is intentional and represents a research hypothesis. Simplex is designed for autonomous agent workflows where agents operate over extended periods. The hypothesis is that agents can infer task dependencies and decomposition from context, potentially discovering structures the specification author did not anticipate. Prescribed composition would constrain this emergent behavior.

If a spec author wants to suggest relationships between functions, they can:
- Use READS/WRITES to show data dependencies
- Use TRIGGERS to show activation conditions
- Write prose in HANDOFF describing what the next stage expects

But Simplex does not enforce ordering. Agents determine sequencing based on their understanding of the full specification.

This design choice is experimental. Future versions may revisit it based on empirical results from autonomous agent research.

---

## Shared Memory

When agents coordinate through shared state—a knowledge graph, a key-value store, a file system—the READS, WRITES, and TRIGGERS landmarks describe interaction patterns.

However, Simplex does not define what shared memory is or how it works. It only provides landmarks for describing contracts against it. The implementation of shared memory is an agent concern.

A specification might say:

```
READS:
  - SharedMemory.knowledge_graph (policy relationships)

WRITES:
  - SharedMemory.artifacts["compiled_output"]
```

Whether SharedMemory is a graph database, a Redis instance, or a directory of JSON files is not the spec's concern. The contract is that something called SharedMemory exists, supports these operations, and agents can rely on it.

---

## Linter Specification

The following specification defines a Simplex linter. The linter enforces the "enforced simplicity" pillar through concrete limits and checks.

```
DATA: LintResult
  valid: boolean
  errors: list of LintError
  warnings: list of LintWarning

DATA: LintError
  location: string, which landmark or line
  code: string, error identifier
  message: string, human-readable explanation

DATA: LintWarning
  location: string
  code: string
  message: string

FUNCTION: lint_spec(spec_text) → LintResult

  RULES:
    - parse spec_text to identify all landmarks and their content
    - check structural validity: required landmarks present
    - check complexity limits (see thresholds below)
    - check semantic validity: example coverage, interpretation uniqueness
    - check style guidance: behavioral rules, observable completion
    - collect all errors and warnings
    - spec is valid only if zero errors

  DONE_WHEN:
    - all landmarks examined
    - all checks performed
    - LintResult populated with findings

  EXAMPLES:
    (minimal valid spec) → {valid: true, errors: [], warnings: []}
    (missing ERRORS landmark) → {valid: false, errors: [{code: "E001", ...}], warnings: []}
    (RULES block over limit) → {valid: false, errors: [{code: "E010", ...}], warnings: []}
    (uncovered branch in RULES) → {valid: false, errors: [{code: "E020", ...}], warnings: []}

  ERRORS:
    - unparseable input → fail with "cannot parse spec: {details}"
    - any unhandled condition → fail with descriptive message

FUNCTION: check_complexity(spec) → list of LintError

  RULES:
    - RULES block exceeds 15 items → error E010 "RULES too complex: {count} items, max 15"
    - FUNCTION has more than 6 inputs → error E011 "too many inputs: {count}, max 6"
    - EXAMPLES fewer than branch count in RULES → error E020 "insufficient examples: {count} examples for {branches} branches"
    - single RULES item exceeds 200 characters → warning W010 "rule may be too complex"
    - spec contains more than 10 FUNCTION blocks → warning W011 "consider splitting into multiple specs"

  DONE_WHEN:
    - all complexity thresholds checked
    - errors collected

  EXAMPLES:
    (spec with 5 RULES items, 3 inputs, 4 examples for 4 branches) → []
    (spec with 20 RULES items) → [E010]
    (spec with 8 inputs) → [E011]
    (spec with 2 examples for 4 branches) → [E020]

  ERRORS:
    - any unhandled condition → fail with descriptive message

FUNCTION: check_coverage(rules, examples) → list of LintError

  RULES:
    - identify all conditional branches in rules
    - "if X" introduces one branch
    - "if X or Y" introduces two branches
    - "if X, otherwise Y" introduces two branches
    - "optionally" introduces two branches (with and without)
    - for each branch, verify at least one example exercises it
    - uncovered branch → error E020

  DONE_WHEN:
    - all branches identified
    - all branches checked against examples
    - errors collected

  EXAMPLES:
    (4 branches, 4 examples each covering one) → []
    (4 branches, 3 examples covering 3) → [E020 for uncovered branch]
    ("if X or Y" with only X shown) → [E020 "branch 'Y' not covered by examples"]

  ERRORS:
    - cannot parse RULES structure → error E021 "cannot identify branches in RULES"
    - any unhandled condition → fail with descriptive message

FUNCTION: check_observability(done_when) → list of LintError

  RULES:
    - each criterion in DONE_WHEN must be externally observable
    - references to "internal state" → error E030
    - references to "variable" or "data structure" → error E030
    - valid: references to outputs, return values, side effects, written files
    - valid: references to SharedMemory state

  DONE_WHEN:
    - all DONE_WHEN criteria examined
    - non-observable criteria flagged

  EXAMPLES:
    ("output contains no duplicates") → []
    ("internal counter reaches zero") → [E030]
    ("all items processed") → warning W030 "may not be observable without clarification"

  ERRORS:
    - any unhandled condition → fail with descriptive message

FUNCTION: check_behavioral(rules) → list of LintError

  RULES:
    - RULES must describe outcomes, not procedures
    - procedural indicators: "loop", "iterate", "for each", "step 1", "then"
    - procedural indicators: "create a variable", "initialize", "increment"
    - finding procedural language → error E040 "RULES should be behavioral, not procedural"
    - valid: describes what is true of output
    - valid: describes conditions and their corresponding outcomes

  DONE_WHEN:
    - all RULES items examined
    - procedural language flagged

  EXAMPLES:
    ("items matching criteria are included") → []
    ("loop through items and add matches") → [E040]
    ("first, parse the input, then validate") → [E040]

  ERRORS:
    - any unhandled condition → fail with descriptive message

CONSTRAINT: linter_thresholds
  the specific numeric limits (15 rules, 6 inputs, 200 chars) are defaults
  implementations may allow configuration
  the principle is enforced simplicity, not specific numbers
```

---

## Meta-Specification

Simplex can describe itself. The following specification defines how agents should interpret Simplex documents.

```
DATA: Landmark
  name: string, all caps
  purpose: what it communicates
  required: yes | no

DATA: Spec
  functions: one or more FUNCTION blocks
  data: zero or more DATA blocks
  constraints: zero or more CONSTRAINT blocks

FUNCTION: parse_spec(text) → Spec

  RULES:
    - landmarks are all-caps words followed by colon
    - required: FUNCTION, RULES, DONE_WHEN, EXAMPLES, ERRORS
    - optional: DATA, CONSTRAINT, READS, WRITES, TRIGGERS, NOT_ALLOWED, HANDOFF, UNCERTAIN
    - content continues until next landmark or end
    - allow for formatting inconsistency
    - extract meaning not syntax
    - ignore unrecognized landmarks

  DONE_WHEN:
    - all FUNCTION blocks identified with nested landmarks
    - all DATA and CONSTRAINT blocks identified

  ERRORS:
    - no FUNCTION found → "invalid spec: no functions"
    - any unhandled condition → fail with descriptive message

  EXAMPLES:
    (well-formed text) → Spec
    (sloppy formatting) → Spec if meaning clear
    (unknown landmarks) → Spec, unknowns ignored
    (missing ERRORS) → "invalid spec: ERRORS required"

FUNCTION: validate_spec(spec) → valid | issues

  RULES:
    - FUNCTION requires RULES, DONE_WHEN, EXAMPLES, ERRORS
    - RULES must be behavioral, not procedural
    - DONE_WHEN must be externally observable
    - EXAMPLES must cover every conditional branch in RULES
    - EXAMPLES must not be satisfiable by conflicting interpretations
    - ERRORS must specify at least default failure behavior
    - DATA types referenced must be defined or obvious
    - CONSTRAINT must state verifiable invariants

  DONE_WHEN:
    - structural checks complete
    - semantic checks complete
    - all issues collected

  ERRORS:
    - none; issues are returned, not thrown
    - any unhandled condition → fail with descriptive message

  EXAMPLES:
    (complete spec with full coverage) → valid
    (missing ERRORS landmark) → issues: ["E001: ERRORS required"]
    (uncovered branch) → issues: ["E020: branch X not covered"]
    (procedural RULES) → issues: ["E040: RULES should be behavioral"]
    (non-observable DONE_WHEN) → issues: ["E030: criterion not observable"]

CONSTRAINT: self_description
  this specification is parseable by parse_spec
  this specification passes validate_spec
  this specification passes lint_spec with zero errors
```

The self-description constraint is meaningful. Any future version of Simplex must remain self-describing and pass its own linter. This provides a check on specification evolution: changes that break self-description or fail linting are changes that have gone too far.

---

## Usage Guidance

When writing a Simplex specification, start with the function signature and examples. The examples force clarity about inputs and outputs before you describe behavior. Many specification errors become obvious when you try to write concrete examples.

Next, write the rules. Describe behavior, not implementation. If you catch yourself writing "loop through" or "create a variable," step back. Describe what should be true of the output, not how to compute it.

Then write the completion criteria. These should be observable from outside the function. "Internal data structure is consistent" is not observable. "Output contains no duplicates" is observable.

Write the error handling. At minimum, specify that unhandled conditions fail with descriptive messages. For functions with known failure modes, map specific conditions to specific responses.

Add optional landmarks only as needed. A simple function may need nothing beyond the required five. A function that interacts with shared memory or has complex coordination needs benefits from READS, WRITES, TRIGGERS. A function operating in uncertain environments benefits from UNCERTAIN.

If a specification becomes unwieldy, decompose it. Multiple simple specs are better than one complex spec. If the linter flags complexity errors, that is a signal to break the work into smaller pieces.

Run the linter before considering a specification complete. A spec that passes linting has met the structural and semantic requirements for validity.

---

## Version History

**v0.3** — Current version. Made ERRORS required. Added UNCERTAIN landmark for confidence signaling. Added Validation Criteria section with semantic ambiguity detection. Added Linter Specification. Clarified that composition absence is an intentional research hypothesis. Updated meta-specification for new requirements.

**v0.2** — Established pillars, landmarks, interpretation model, and meta-specification.

**v0.1** — Initial exploration. Identified need for specification targeting autonomous agents.
