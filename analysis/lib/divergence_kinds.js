// Rule-based description of divergences (Task 5): one kind per divergence and its direction in the layers of
// Fig. tomcat-layers (tomcat.util.net below coyote below catalina). Pure functions; see divergence_kinds.js.

// Participants whose types hold the data of one request and its response.
const REQUEST_MODEL = new Set(['Request', 'Response', 'CoyoteRequest', 'CoyoteResponse', 'MimeHeaders',
  'CookieProcessor', 'InputBuffer']);
const ACCESSOR = /^(get|set|is|has|find|add|remove)[A-Z]/;

const labels = component => component.split('|').map(s => s.trim());

// Kind of a divergence between two components (labels joined by ' | '), checked in this order:
// inheritance (the source type extends or implements the target type), creation (constructors only),
// request-model (both ends hold request or response data), accessor (only getters and setters), other.
function kindOf({ from, to, methods, inherits }) {
  if (inherits) return 'inheritance';
  const named = methods.filter(m => m !== '<init>');
  if (methods.length && !named.length) return 'creation';
  const inModel = c => labels(c).some(l => REQUEST_MODEL.has(l));
  if (inModel(from) && inModel(to)) return 'request-model';
  if (named.length && named.every(m => ACCESSOR.test(m))) return 'accessor';
  return 'other';
}

// Layer of a type: 1 = org.apache.tomcat.util.net, 2 = org.apache.coyote, 3 = org.apache.catalina, else null.
function layerOf(fqn) {
  if (fqn.startsWith('org.apache.tomcat.util.net.')) return 1;
  if (fqn.startsWith('org.apache.coyote.')) return 2;
  if (fqn.startsWith('org.apache.catalina.')) return 3;
  return null;
}

// Direction of the type pairs ("a -> b") of one divergence: up if any pair calls a higher layer (against the
// layered style), else down if any calls a lower one, else same; n/a if no pair has both ends in a layer.
function direction(pairs) {
  const steps = pairs.map(p => p.split(' -> ').map(layerOf)).filter(([a, b]) => a && b).map(([a, b]) => b - a);
  if (!steps.length) return 'n/a';
  if (steps.some(s => s > 0)) return 'up';
  if (steps.some(s => s < 0)) return 'down';
  return 'same';
}

module.exports = { kindOf, layerOf, direction };
