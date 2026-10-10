# Filters

The list of checks can be narrowed with a filter such as
`(status is Unproven OR status is Stale) AND area is Git`, which picks two of
the eight checks in the sample workspace.

A filter is a typed tree of conditions, and the language is closed on purpose:
four fields, a fixed set of operators for each, and exactly two levels of
grouping. The conditions in a group share one joiner and the groups share
another, so there is no precedence to work out.

| Field        | Operators               | Argument                                                  |
| ------------ | ----------------------- | --------------------------------------------------------- |
| `status`     | `is`, `isNot`           | one of `Unarmed`, `Broken`, `Proven`, `Stale`, `Unproven` |
| `area`       | `is`, `isNot`           | text                                                      |
| `lastCaught` | `never`                 | none                                                      |
| `lastCaught` | `before`, `after`       | a whole number of days                                    |
| `runs`       | `moreThan`, `fewerThan` | a whole number of runs                                    |

The filter lives in the page's address, so a refresh, the back button and "Copy
link" all keep it, and a filter is shared by sending that link. The example
above is this one:

```
/?f=and!or*status.is.Unproven*status.is.Stale!and*area.is.Git
```

The grammar spells the language out rather than encoding it. Its alphabet is
exactly the set `encodeURIComponent` leaves untouched, so a link pasted into a
chat window stays legible, every filter has one link rather than several, and
parsing a link gives back the filter it was written from.
`packages/filter/README.md` sets the grammar out in full.

Values are compared exactly as they are written. The sample workspace spells its
areas `CI`, `Git`, `Lint`, `Release` and `Review`, so `area.is.git` matches
nothing.

Changing the filter pushes a history entry rather than replacing one, so back
and forward step through the filters that were built. A change that leaves the
filter as the address already reads it adds no entry, so one press of back
undoes one thing.

`f=all` is accepted on the way in and means the filter that hides nothing. The
app never writes it: the list nobody has narrowed is the bare address `/`.

A filter is validated where it enters the API, by the same reader that reads a
link, and only then compiled into SQL. Every value a filter carries reaches the
database as a bound parameter, so nothing in it is ever concatenated into a
query, and a filter the language cannot express is refused before the resolver
has touched the database.

That compiler is the core of the project, and it is tested accordingly: every
filter the app can express must compile to the query it means, and every shared
link must parse back into the same filter.
