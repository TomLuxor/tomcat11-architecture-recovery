# RQ3: classifying the documented messages that static analysis cannot find

**Why:** Technique A checks every documented message (arrow in a sequence diagram) against the calls in the code. 48 messages are absent at **both** mapping levels: static analysis finds no call from the source to the target, however the boxes are mapped. RQ3 asks which mechanisms hide them (paper, Section 4.7). The messages are classified twice, **independently**, with the categories below, which were fixed before the classification: once by applying the rules of this codebook mechanically to the facts (`rq3_rules.csv`, produced by `analysis/rq3_sheet.js`) and once by an author (`rq3_<name>.csv`). The paper reports how often both agree.

Not classified here, and counted automatically (`../output/rq3_groups.csv`):
- 21 messages that are found at the interface level but not at the implementation level, and 31 the other way round. They are recovered statically and only depend on the mapping (RQ1).
- 12 messages with an unmapped end (filters, JDK classes). They are absent because of the mapping.

**Rules:**
- Work on your own; do not look at `rq3_rules.csv` or another reviewer's file before yours is committed.
- Fill in `rq3_<your name>.csv`: for each message one `category` from the list below and a short `reason`.
- Use the facts in `rq3_facts.md`. They come from the source model; you do not need to read the Tomcat code.
- Log your time in `../effort_log.csv` (fill in `ai_assistance`).

## How to read the facts

A message is found only if a method of the **source** type calls a method declared by the **target** type, both at the same mapping level. The facts say what the source calls instead:
- *calls … on X, a supertype of the target*: the call goes to an interface or superclass of the target; which class runs is only decided at run time.
- *… at the other mapping level than the caller*: the class of one end calls the interface of the other end (as in `StandardEngine` → `Host`), so neither level matches.
- *in an inherited method of a superclass*: the call is written in a superclass of the source, not in the source type itself.
- *No type calls … on the target type directly*: nobody calls the target's method by name; it is only reached through an interface, a listener or reflection.
- *Reflective calls in the source*: the source uses `Class.forName`, `Constructor.newInstance`, `Method.invoke` or the `Digester`.

## Categories

| Category | Use it when |
|---|---|
| `reflection` | The target is created or called via reflection (`Class.forName`, `Constructor.newInstance`, `Method.invoke`) or by the `Digester` while it reads a configuration file (configuration-driven assembly). |
| `listener-notification` | The call is a notification of a registered listener (`LifecycleListener.lifecycleEvent`), sent by `fireLifecycleEvent` in `LifecycleBase`. |
| `thread-hand-off` | The work is handed to another thread: submitted to an executor (`execute`) and run by a thread of the pool (`run`). |
| `chain-of-responsibility` | The call passes along the valve pipeline: `getFirst()` on the `Pipeline` interface or `invoke()` on the `Valve` interface; each valve calls the next one. |
| `inherited-call` | The call is made **only** in methods that the source inherits from a superclass (e.g. `ContainerBase` for `StandardHost`), so it is not attributed to the source type. If the source also calls the method itself, use the next category. |
| `interface-dispatch` | The source calls the method on an interface or superclass of the target, or the class of one end calls the interface of the other end. |
| `mapping` | The absence is caused by the mapping itself (e.g. the method exists, but on a type the box was not mapped to). |
| `other: <name>` | None of the above fits; give the new category a short name and explain it in `reason` (e.g. a mistake in the diagram). |

**If several fit, take the first one in the table.** The order goes from the most specific mechanism to the most general one: a valve called through the `Valve` interface is `chain-of-responsibility`, not `interface-dispatch`; a listener called in an inherited method is `listener-notification`, not `inherited-call`.

## Afterwards

`node analysis/compare_reviews.js analysis/review/rq3_rules.csv analysis/review/rq3_<name>.csv id category` prints the agreement and the messages classified differently.
