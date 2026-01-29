# Simplex

A workflow specification for autonomous agents.

An observed trend in AI development is the creation of new programming languages designed specifically for LLM code generation. The premise is reasonable. LLMs make syntax errors and struggle with operator precedence, so cleaner languages with unambiguous syntax, mandatory testing, and minimal keywords should help.

However, it addresses a problem that LLMs largely do not have.

LLMs are excellent at syntax. They've seen billions of lines of code in every language. They rarely struggle with semicolons, brackets, or operator precedence. What they struggle with is understanding intent, constraints, and edge cases. A new language with cleaner syntax addresses the easy part while leaving the hard part, specification, entirely in natural language prompts.

The real bottleneck lies not in code generation, but in specification: expressing what we want clearly enough for autonomous systems to act on without constant clarification.

## Inverting the Problem

Rather than making code easier for LLMs to write, what if we made specification easier for humans to write, consistent across teams in large organizations, and rigorous enough for LLMs to act on without clarification?

Humans will always be the specifiers. We know what we want to build. The question is how to express that knowledge in a form that autonomous agents can execute reliably for extended periods without human intervention.

Natural language tends to be too ambiguous for reliable autonomous execution, while programming languages are too prescriptive. What seems to be needed is something in between: a specification format that captures intent and constraints without dictating implementation.

## What Simplex Is

Simplex is a specification for autonomous agents that describes work rather than workers, capturing what needs to be done and how to know when it's done without prescribing how to do it.

Simplex has no formal grammar. It uses landmarks, structural markers like FUNCTION, RULES, DONE_WHEN, and EXAMPLES, that LLMs recognize and interpret directly. Syntax is forgiving; meaning must be precise.

Here is an example specification for an e-commerce checkout system:

```yaml
FUNCTION: process_checkout(cart, customer, payment) → CheckoutResult

RULES:
  - verify cart is not empty and all items are in stock
  - validate customer shipping address with postal service
  - apply discount codes and calculate final total
  - authorize payment for the calculated amount
  - reserve inventory for purchased items
  - generate order confirmation with tracking number

DONE_WHEN:
  - order is persisted with confirmed payment, or
  - checkout fails with specific reason at point of failure

EXAMPLES:
  (valid_cart, verified_customer, good_card)
    → { success: true, order_id: "ORD-12345", total: 99.50 }
  (empty_cart, any, any)
    → { success: false, reason: "cart is empty" }
  (valid_cart, unverified_address, any)
    → { success: false, reason: "address verification failed" }
  (valid_cart, verified_customer, declined_card)
    → { success: false, reason: "payment declined" }

ERRORS:
  - payment gateway timeout → retry once, then fail with "payment unavailable"
  - inventory changed during checkout → fail with "cart contents changed"
  - any unhandled condition → fail with descriptive message
```

Five pillars guide the design:

**Enforced simplicity** requires that complex specifications be decomposed into smaller pieces. If something cannot be expressed simply, it is not yet understood well enough to specify.

**Syntactic tolerance, semantic precision** means Simplex forgives typos and formatting inconsistencies while requiring unambiguous meaning.

**Testability** requires concrete examples for every function. These serve as contracts and ground truth.

**Completeness** requires that specifications be sufficient without clarification. No back-and-forth, no requests for additional context.

**Implementation autonomy** means Simplex describes behavior and constraints, never implementation. Algorithms, data structures, and technology choices belong to agents.

## Why This Matters

Autonomous agent workflows are maturing. Agents now work for extended periods, developing applications, iterating on solutions, evaluating versions among themselves, and producing release candidates. These workflows need instructions that are complete enough to act on yet flexible enough to allow emergent problem-solving.

Simplex is designed for this context: a human writes a specification that agents interpret, decompose, and execute autonomously. The specification serves as the contract between human intent and machine action.

Perhaps what matters most is not how LLMs write code, but how humans express what they want built. A specification designed for human authors, one that captures intent precisely enough for autonomous agents to act on, may prove more valuable than any improvements to code generation itself.

## References

[1] Y. Liu et al., "SWE-EVO: Benchmarking Coding Agents in Long-Horizon Software Evolution Scenarios," arXiv:2512.18470, December 2025. https://arxiv.org/abs/2512.18470
