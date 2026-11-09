// RQ3 helpers: which absent messages are classified, and the facts shown to the classifiers. Pure functions.

// Messages absent at both mapping levels are classified. Messages recovered at one level only depend on the
// mapping (RQ1), and unmapped ones are counted separately (Section 4.7).
function selectAbsences(rows) {
  const is = (r, i, m) => r.interface_status === i && r.implementation_status === m;
  const toClassify = rows.filter(r => is(r, 'absence', 'absence'));
  const counts = {
    absentAtBothLevels: toClassify.length,
    foundAtInterfaceLevelOnly: rows.filter(r => is(r, 'convergence', 'absence')).length,
    foundAtImplementationLevelOnly: rows.filter(r => is(r, 'absence', 'convergence')).length,
    unmapped: rows.filter(r => r.interface_status === 'unmapped' || r.implementation_status === 'unmapped').length,
    foundAtBothLevels: rows.filter(r => is(r, 'convergence', 'convergence')).length,
  };
  return { toClassify, counts };
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

// Method names at most two edits away from the documented name (to spot misspellings in the diagrams).
function similarNames(name, methods) {
  if (!name) return [];
  return [...new Set(methods)].filter(m => editDistance(name.toLowerCase(), m.toLowerCase()) <= 2);
}

const short = fqn => fqn.replace(/^org\.apache\./, '');
const BY = { self: '', nested: ' (in a nested or anonymous class)', supertype: ' (in an inherited method of a superclass)' };

// One paragraph of facts for a classifier, from the result of queries/absence_facts.cypher. `name` is the
// documented method name as written in the diagram, `to` the mapped types of the target at both levels.
function describeFacts(facts, name, to = []) {
  const shown = name === '<init>' ? 'a constructor' : name ? `${name}()` : null;
  if (!shown) return 'The diagram names no method for this message.' +
    (facts.reflective.length ? ` Reflective calls in the source: ${facts.reflective.map(short).join(', ')}.` : '');
  const out = [];
  const toTarget = facts.calls.filter(c => c.toTarget);
  const others = facts.calls.filter(c => !c.toTarget);
  for (const c of toTarget) {
    const what = to.includes(c.declaredBy)
      ? 'a mapped type of the target, but at the other mapping level than the caller'
      : 'a supertype of the target';
    out.push(`${short(c.caller)}${BY[c.by]} calls ${shown} on ${short(c.declaredBy)}, ${what}.`);
  }
  if (!toTarget.length && others.length && name !== '<init>') {
    out.push(`The source does not call ${shown} on the target or its scanned supertypes, but on: ` +
      `${[...new Set(others.map(c => short(c.declaredBy) + BY[c.by]))].join(', ')}.`);
  }
  if (!facts.calls.length || (!toTarget.length && name === '<init>')) {
    out.push(`The source (and its superclasses) never calls ${name === '<init>' ? 'a constructor of the target' : shown}.`);
  }
  out.push(facts.callers.length
    ? `Types that call ${shown} on the target type directly: ${facts.callers.map(short).join(', ')}.`
    : `No type calls ${shown} on the target type directly.`);
  if (!facts.declaredBy.length) {
    const similar = similarNames(name, facts.methods);
    out.push(`The target has no method of that name${similar.length ? `; similar: ${similar.join(', ')}` : ''}.`);
  }
  if (facts.reflective.length) out.push(`Reflective calls in the source: ${facts.reflective.map(short).join(', ')}.`);
  return out.join(' ');
}

// Category by the rules of review/rq3_instructions.md, applied in its order to the result of absence_facts.cypher.
function classifyByRules(facts, name) {
  const n = (name || '').toLowerCase();
  const toTarget = facts.calls.filter(c => c.toTarget);
  if (facts.reflective.length && !toTarget.length) return 'reflection';
  if (n === 'lifecycleevent' || toTarget.some(c => c.declaredBy === 'org.apache.catalina.LifecycleListener')) {
    return 'listener-notification';
  }
  if (n === 'execute' || n === 'run') return 'thread-hand-off';
  if (['getfirst', 'getnext', 'invoke'].includes(n)
      && toTarget.some(c => ['org.apache.catalina.Valve', 'org.apache.catalina.Pipeline'].includes(c.declaredBy))) {
    return 'chain-of-responsibility';
  }
  if (toTarget.length && toTarget.every(c => c.by === 'supertype')) return 'inherited-call';
  if (toTarget.length) return 'interface-dispatch';
  if (!facts.declaredBy.length && similarNames(name, facts.methods).length) return 'other: misspelled in diagram';
  return 'other: no static call';
}

// RQ3, second step (Section 4.7): what a static analysis that follows the type hierarchy could recover. A call of
// the documented method on the target or one of its supertypes (`toTarget` in absence_facts.cypher) can reach every
// concrete in-scope class that is the called type or one of its subtypes; `receiversOf(type)` returns these classes
// (queries/possible_receivers.cypher). Since the called type is the target or a supertype of it, the target's own
// class is among them whenever it is concrete and in scope. Rules, in this order:
//   diagram-error   the documented method does not exist, but one with a similar name does
//   no-static-call  no such call (reflection, hand-off through JDK types, no call at all), or no class can receive it
//   unique          the call creates the target, or a called type has exactly one possible receiver class
//   ambiguous       every called type has several possible receiver classes, so configuration or run time decides
const RESOLUTIONS = ['unique', 'ambiguous', 'no-static-call', 'diagram-error'];

function resolveStatically(facts, name, receiversOf) {
  if (!facts.declaredBy.length && similarNames(name, facts.methods).length) return { resolution: 'diagram-error', receivers: 0 };
  const called = [...new Set(facts.calls.filter(c => c.toTarget).map(c => c.declaredBy))];
  if (!called.length) return { resolution: 'no-static-call', receivers: 0 };
  if (name === '<init>') return { resolution: 'unique', receivers: 1 };
  const counts = called.map(type => receiversOf(type).length).filter(n => n > 0);
  if (!counts.length) return { resolution: 'no-static-call', receivers: 0 };
  const fewest = Math.min(...counts);
  return { resolution: fewest === 1 ? 'unique' : 'ambiguous', receivers: fewest };
}

// Messages per mechanism and resolution, largest mechanism first, with a total row.
function summarizeResolutions(rows) {
  const row = (mechanism, list) => ({ mechanism, messages: list.length,
    ...Object.fromEntries(RESOLUTIONS.map(r => [r, list.filter(x => x.resolution === r).length])) });
  const mechanisms = [...new Set(rows.map(r => r.mechanism))];
  const perMechanism = mechanisms.map(m => row(m, rows.filter(r => r.mechanism === m)))
    .sort((a, b) => b.messages - a.messages);
  return [...perMechanism, row('total', rows)];
}

module.exports = { selectAbsences, similarNames, describeFacts, classifyByRules, RESOLUTIONS, resolveStatically,
  summarizeResolutions };
