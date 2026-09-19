# Writing a migration

Numbered plain SQL, applied in filename order, each file in one transaction.
Read the most recent one for the house style. This file holds the one thing
that style cannot show you, because it is about what is missing rather than
about what is there.

## A CHECK constraint passes on NULL

In PostgreSQL a check constraint refuses a row only when its expression
evaluates to **false**. Null is not false, so any constraint whose expression
can evaluate to null is silently vacuous for exactly the rows it exists to
refuse, and it reads on the page as though it forbids them.

Two shapes do this, and both have been written in this schema:

- **A bare `btrim(col) <> ''`.** `btrim(null)` is null, so `TRUE AND null` is
  null and the constraint passes on a row where the column is absent
  altogether. `0006` requires a reason from a run that settled nothing, and
  without the `col IS NOT NULL` spelled out beside the `btrim` it was seen
  accepting a run that settled nothing and gave no reason at all: the row
  landed, and the test that expected a refusal failed.
- **A `CASE` over an enum with no `ELSE`.** It returns null for a label it does
  not list, so the constraint passes. `0004` holds a run's source and its
  evidence together and is written as two branches joined by `OR` rather than
  as a `CASE` for this reason: a third source added to the enum later would
  otherwise have been accepted carrying any evidence at all, and nothing would
  have said so.

Two migrations, two authors, hours apart, the same blind spot. It is the
subject of this product turning up in its own schema, so it is written down
here rather than left to be rediscovered a third time.

**So:** write the branches as a positive list of the values that are allowed,
so a value added to the enum later evaluates false rather than null. Spell
`IS NOT NULL` beside anything that can return null. Then plant the row the
constraint exists to refuse, watch it be refused **by the constraint's own
name**, remove the plant and watch the row land. Every constraint here is
named so that a test can assert which rule fired rather than that something
did; a test that only asserts "the insert failed" passes just as well when an
unrelated rule fired instead.

A guard nobody has watched deny anything is a guard nobody knows the state of,
which is the whole of what this repository is about.
