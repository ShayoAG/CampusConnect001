import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data/architecture');

async function loadJson(name) {
  const filePath = path.join(dataDir, name);
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

const [core, elements, flows, views] = await Promise.all([
  loadJson('core.json'),
  loadJson('elements.json'),
  loadJson('flows.json'),
  loadJson('views.json'),
]);

const errors = [];
const warnings = [];

function err(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    err(`${label} must be an array.`);
    return [];
  }
  return value;
}

function collectIds(items, label) {
  const idMap = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      err(`${label} contains a non-object item.`);
      continue;
    }
    if (!item.id || typeof item.id !== 'string') {
      err(`${label} item is missing a string id.`);
      continue;
    }
    if (idMap.has(item.id)) {
      err(`${label} has duplicate id '${item.id}'.`);
    }
    idMap.set(item.id, item);
  }
  return idMap;
}

const zones = assertArray(core.zones, 'zones');
const rings = assertArray(core.rings, 'rings');
const groups = assertArray(core.groups, 'groups');

const nodes = assertArray(elements.nodes, 'nodes');
const actors = assertArray(elements.actors, 'actors');
const serviceBadges = assertArray(elements.serviceBadges, 'serviceBadges');
const embeddedNodes = assertArray(elements.embeddedNodes, 'embeddedNodes');

const edges = assertArray(flows.edges, 'edges');

const viewModes = assertArray(views.viewModes, 'viewModes');
const scenarios = assertArray(views.scenarios, 'scenarios');
const layers = assertArray(views.architectureLayers, 'architectureLayers');

const zoneIds = collectIds(zones, 'zones');
const ringIds = collectIds(rings, 'rings');
const groupIds = collectIds(groups, 'groups');

const nodeIds = collectIds(nodes, 'nodes');
const actorIds = collectIds(actors, 'actors');
const badgeIds = collectIds(serviceBadges, 'serviceBadges');
const embeddedIds = collectIds(embeddedNodes, 'embeddedNodes');
const edgeIds = collectIds(edges, 'edges');
const viewModeIds = collectIds(viewModes, 'viewModes');
const scenarioIds = collectIds(scenarios, 'scenarios');
const layerIds = collectIds(layers, 'architectureLayers');

const entityIds = new Set();
for (const id of [...nodeIds.keys(), ...actorIds.keys(), ...badgeIds.keys(), ...groupIds.keys()]) {
  if (entityIds.has(id)) {
    err(`Duplicate entity id across nodes/actors/serviceBadges/groups: '${id}'.`);
  }
  entityIds.add(id);
}

for (const ring of rings) {
  if (!zoneIds.has(ring.id)) {
    err(`ring '${ring.id}' has no matching zone id.`);
  }
}

for (const group of groups) {
  if (!zoneIds.has(group.zone)) {
    err(`group '${group.id}' references unknown zone '${group.zone}'.`);
  }
  for (const nodeId of group.nodeIds || []) {
    if (!nodeIds.has(nodeId)) {
      err(`group '${group.id}' references unknown node '${nodeId}'.`);
    }
  }
}

for (const node of nodes) {
  if (!zoneIds.has(node.zone)) {
    err(`node '${node.id}' references unknown zone '${node.zone}'.`);
  }
}

for (const actor of actors) {
  if (!zoneIds.has(actor.zone)) {
    err(`actor '${actor.id}' references unknown zone '${actor.zone}'.`);
  }
  for (const touchId of actor.touchNodeIds || []) {
    if (!entityIds.has(touchId)) {
      err(`actor '${actor.id}' has unknown touchNodeId '${touchId}'.`);
    }
  }
  for (const flowId of actor.flowEdgeIds || []) {
    if (!edgeIds.has(flowId)) {
      err(`actor '${actor.id}' has unknown flowEdgeId '${flowId}'.`);
    }
  }
}

for (const badge of serviceBadges) {
  if (!zoneIds.has(badge.zone)) {
    err(`serviceBadge '${badge.id}' references unknown zone '${badge.zone}'.`);
  }
}

for (const embedded of embeddedNodes) {
  if (!nodeIds.has(embedded.parentNodeId)) {
    err(`embeddedNode '${embedded.id}' references unknown parentNodeId '${embedded.parentNodeId}'.`);
  }
  if (!zoneIds.has(embedded.zone)) {
    err(`embeddedNode '${embedded.id}' references unknown zone '${embedded.zone}'.`);
  }
}

for (const edge of edges) {
  if (!entityIds.has(edge.source)) {
    err(`edge '${edge.id}' has unknown source '${edge.source}'.`);
  }
  if (!entityIds.has(edge.target)) {
    err(`edge '${edge.id}' has unknown target '${edge.target}'.`);
  }
}

for (const scenario of scenarios) {
  if (scenario.viewModeId && !viewModeIds.has(scenario.viewModeId)) {
    err(`scenario '${scenario.id}' references unknown viewModeId '${scenario.viewModeId}'.`);
  }

  for (const id of scenario.nodeIds || []) {
    if (!entityIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown nodeId '${id}'.`);
    }
  }

  for (const id of scenario.visibleNodeIds || []) {
    if (!entityIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown visibleNodeId '${id}'.`);
    }
  }

  for (const id of scenario.visibleActorIds || []) {
    if (!actorIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown visibleActorId '${id}'.`);
    }
  }

  for (const id of scenario.visibleServiceBadgeIds || []) {
    if (!badgeIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown visibleServiceBadgeId '${id}'.`);
    }
  }

  for (const id of scenario.edgeIds || []) {
    if (!edgeIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown edgeId '${id}'.`);
    }
  }

  for (const id of scenario.visibleEdgeIds || []) {
    if (!edgeIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown visibleEdgeId '${id}'.`);
    }
  }

  for (const id of scenario.visibleZoneIds || []) {
    if (!zoneIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown visibleZoneId '${id}'.`);
    }
  }

  for (const id of scenario.visibleGroupIds || []) {
    if (!groupIds.has(id)) {
      err(`scenario '${scenario.id}' has unknown visibleGroupId '${id}'.`);
    }
  }
}

for (const mode of viewModes) {
  const scenarioList = mode.scenarioIds || [];
  for (const scenarioId of scenarioList) {
    if (!scenarioIds.has(scenarioId)) {
      err(`viewMode '${mode.id}' has unknown scenarioId '${scenarioId}'.`);
    }
  }

  if (mode.defaultScenarioId && !scenarioIds.has(mode.defaultScenarioId)) {
    err(`viewMode '${mode.id}' has unknown defaultScenarioId '${mode.defaultScenarioId}'.`);
  }

  if (mode.defaultScenarioId && scenarioList.length && !scenarioList.includes(mode.defaultScenarioId)) {
    warn(`viewMode '${mode.id}' defaultScenarioId '${mode.defaultScenarioId}' is not listed in scenarioIds.`);
  }
}

for (const layer of layers) {
  if (!scenarioIds.has(layer.scenarioId)) {
    err(`architectureLayer '${layer.id}' has unknown scenarioId '${layer.scenarioId}'.`);
  }
}

if (!viewModes.length) {
  err('At least one viewMode is required.');
}

if (!scenarios.length) {
  err('At least one scenario is required.');
}

for (const message of warnings) {
  console.warn(`WARN: ${message}`);
}

if (errors.length) {
  for (const message of errors) {
    console.error(`ERROR: ${message}`);
  }
  console.error(`\nValidation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Validation successful: ${nodeIds.size} nodes, ${actorIds.size} actors, ${badgeIds.size} serviceBadges, ${edgeIds.size} edges, ${scenarioIds.size} scenarios.`
);
