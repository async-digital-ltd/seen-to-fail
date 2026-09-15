# `@seen-to-fail/filter`

The filter language, shared by the server and the web client so the two cannot
drift apart. A filter narrows the list of checks: `(status is Unproven OR status
is Stale) AND area is CI`.

The language is closed on purpose. Four fields, a fixed set of operators for
each, and exactly two levels of grouping. `parseFilter` is the only supported
way to turn untrusted input into a `Filter`, and the types it returns cannot
hold a combination the language does not have.

## The link grammar

A filter can be shared as a link, where it travels in the `f` query parameter.
`serializeFilter` writes one and `parseFilterString` reads one back, returning
the same result shape as `parseFilter`.

```
filter    = "all" | joiner "!" group { "!" group }
group     = joiner "*" condition { "*" condition }
condition = field "." operator [ "." argument ]
joiner    = "and" | "or"
```

Three properties hold.

**It reads.** A link pasted into a chat window stays legible, because the
grammar spells the language out rather than encoding it. The alphabet is
letters, digits, and `. ! * ~ _ -`, which is exactly the set
`encodeURIComponent` leaves untouched. A link built by hand and the same link
built with a standard encoder come out identical, so nothing turns into `%3B` on
the way. More obvious separators such as `;` and `,` are legal in a query string
and would read better, but every standard encoder escapes them, so they lose the
property the grammar is for.

**It round-trips.** Serialising a filter and parsing the result gives back a
filter equal to the original, for every filter the language can express. The
property test that proves this runs 500 randomly generated filters.

**It is deterministic.** A filter has exactly one link, so two people sharing
the same filter paste the same text. Both joiners are written out even where a
list holds a single item, because the joiner is part of what the filter holds
and inferring it on the way back would lose it. Numbers have one spelling, so
`007` is refused where `7` is accepted. Two filters that mean the same thing but
list their groups in a different order are different filters and get different
links.

### Fields and operators

Every operator writes its own name, so no two conditions can come out as the
same text. In particular `runs.moreThan.5` and `runs.fewerThan.5` differ in the
only place they could.

| Field        | Operator token          | Argument                                                  |
| ------------ | ----------------------- | --------------------------------------------------------- |
| `status`     | `is`, `isNot`           | one of `Unarmed`, `Broken`, `Proven`, `Stale`, `Unproven` |
| `area`       | `is`, `isNot`           | text                                                      |
| `lastCaught` | `never`                 | none                                                      |
| `lastCaught` | `before`, `after`       | a whole number of days                                    |
| `runs`       | `moreThan`, `fewerThan` | a whole number of runs                                    |

### Values

A value keeps letters, digits, hyphens and underscores as they are, so an
ordinary area name such as `ci` is readable in the link. Anything else, the
separators and the escape character included, becomes a tilde and the four upper
case hexadecimal digits of its UTF-16 code unit. A space is `~0020`.

Upper case is the only accepted spelling of an escape, and an escape always
carries four digits, so a value has one encoding rather than several.

### Examples

1. `(status is Unproven OR status is Stale) AND area is CI`

   ```
   and!or*status.is.Unproven*status.is.Stale!and*area.is.ci
   ```

   The leading `and` joins the groups. The first group joins its two conditions
   with `or`. The second group holds one condition and still names its joiner.

2. The filter that hides nothing, which lists every check:

   ```
   all
   ```

3. `(runs fewer than 5 AND never caught) OR area is not "smoke tests"`

   ```
   or!and*runs.fewerThan.5*lastCaught.never!and*area.isNot.smoke~0020tests
   ```

   The space in `smoke tests` is written as `~0020`, which is what keeps the
   value from reaching outside the alphabet.

### When a link is wrong

`parseFilterString` never throws, whatever the text holds. A malformed link
comes back as the same rejection shape as a malformed request body, with a path
naming the group and condition at fault, such as
`groups[1].conditions[0]`.

Only the shape of a link is read by the grammar. The candidate it builds goes to
`parseFilter` for the verdict, so a link cannot carry a status, a day count or a
group size the API would refuse. A link asking for a status of `Passing` is
turned down by the schema, at the same path and with the same message as a
request body asking for one.
