import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data/architecture');

const files = [
  'core.json',
  'elements.json',
  'flows.json',
  'views.json',
  'governance.json',
];

const [oldId, newId] = process.argv.slice(2);

if (!oldId || !newId) {
  console.error('Usage: node scripts/rename-architecture-id.mjs <oldId> <newId>');
  process.exit(1);
}

if (oldId === newId) {
  console.error('oldId and newId are identical. Nothing to do.');
  process.exit(1);
}

function replaceExact(value, from, to) {
  if (Array.isArray(value)) {
    return value.map((entry) => replaceExact(entry, from, to));
  }

  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = replaceExact(entry, from, to);
    }
    return next;
  }

  if (typeof value === 'string' && value === from) {
    return to;
  }

  return value;
}

function collectIds(value, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectIds(entry, acc);
    return acc;
  }

  if (value && typeof value === 'object') {
    if (typeof value.id === 'string') {
      acc.add(value.id);
    }
    for (const entry of Object.values(value)) {
      collectIds(entry, acc);
    }
  }

  return acc;
}

const loaded = new Map();
for (const file of files) {
  const filePath = path.join(dataDir, file);
  const raw = await readFile(filePath, 'utf8');
  loaded.set(file, JSON.parse(raw));
}

const allIds = new Set();
for (const data of loaded.values()) {
  collectIds(data, allIds);
}

if (!allIds.has(oldId)) {
  console.error(`ID '${oldId}' was not found in architecture JSON files.`);
  process.exit(1);
}

if (allIds.has(newId)) {
  console.error(`ID '${newId}' already exists. Pick a unique target ID.`);
  process.exit(1);
}

for (const [file, data] of loaded.entries()) {
  const replaced = replaceExact(data, oldId, newId);
  const output = `${JSON.stringify(replaced, null, 2)}\n`;
  await writeFile(path.join(dataDir, file), output, 'utf8');
}

console.log(`Renamed '${oldId}' -> '${newId}' in architecture JSON files.`);
console.log('Run: npm run validate:data');
