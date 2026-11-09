// RQ2: chance level of the layer and component measures. Pure functions.
// A random partition with the same cluster sizes is obtained by permuting the cluster labels over the nodes.
// layerMeasures() follows layer_measures() in technique_b/scoring.py; random_baseline.js checks that both agree.

// Layers of Fig. tomcat-layers by package prefix: 1 = util.net (lowest), 2 = Coyote, 3 = Catalina.
const LAYER_PREFIXES = [['org.apache.tomcat.util.net', 1], ['org.apache.coyote', 2], ['org.apache.catalina', 3]];

function layerOfPackage(pkg) {
  for (const [prefix, layer] of LAYER_PREFIXES) if (pkg === prefix || pkg.startsWith(prefix + '.')) return layer;
  return null;
}

// Small seeded generator (mulberry32), so that the baseline can be reproduced exactly.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random partition with the same cluster sizes: the labels of clusterOf, shuffled over its nodes (Fisher-Yates).
function shuffleLabels(clusterOf, random) {
  const ids = [...clusterOf.keys()];
  const labels = [...clusterOf.values()];
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return new Map(ids.map((id, i) => [id, labels[i]]));
}

// A cluster is dominated by a layer if more than half of its layered types belong to it.
//   ownLayerShare  share of the layered types that lie in a cluster dominated by their own layer
//   againstEdges   edges between two different dominated clusters that run from a lower to a higher layer
function layerMeasures(clusterOf, layerOf, edges) {
  const members = new Map();
  for (const [node, layer] of layerOf) {
    if (layer === null) continue;
    const cluster = clusterOf.get(node);
    if (!members.has(cluster)) members.set(cluster, new Map());
    const counts = members.get(cluster);
    counts.set(layer, (counts.get(layer) || 0) + 1);
  }
  const dominant = new Map();
  for (const [cluster, counts] of members) {
    let best = null, bestCount = 0, total = 0;
    for (const [layer, n] of counts) { total += n; if (n > bestCount) { best = layer; bestCount = n; } }
    if (bestCount * 2 > total) dominant.set(cluster, best);
  }
  let layered = 0, own = 0;
  for (const [node, layer] of layerOf) {
    if (layer === null) continue;
    layered++;
    if (dominant.get(clusterOf.get(node)) === layer) own++;
  }
  let against = 0, compared = 0;
  for (const [source, target] of edges) {
    const cs = clusterOf.get(source), ct = clusterOf.get(target);
    if (cs === ct || !dominant.has(cs) || !dominant.has(ct)) continue;
    compared++;
    if (dominant.get(cs) < dominant.get(ct)) against++;
  }
  return { layeredTypes: layered, dominatedClusters: dominant.size,
    ownLayerShare: layered ? own / layered : NaN, againstEdges: against, comparedEdges: compared };
}

// Number of clusters over which the given nodes are distributed (nodes without a cluster are left out).
function clusterSpread(ids, clusterOf) {
  return new Set(ids.filter(id => clusterOf.has(id)).map(id => clusterOf.get(id))).size;
}

module.exports = { LAYER_PREFIXES, layerOfPackage, seededRandom, shuffleLabels, layerMeasures, clusterSpread };
