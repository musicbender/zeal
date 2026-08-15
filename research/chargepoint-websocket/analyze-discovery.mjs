#!/usr/bin/env node
//
// Analyze raw discovery payloads captured by 01-discovery-dump.sh.
//
// Goal: surface every key node-chargepoint's parseEndpoints() throws away, and every
// ws://|wss:// URL anywhere in the tree — not just under endPoints, since a model-scoped
// channel may be nested elsewhere.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The 12 keys node-chargepoint/src/global-config.ts actually parses. Anything else the
// API returns is currently discarded.
const PARSED_KEYS = new Set([
  'accountsEndpoint',
  'internalApiGatewayEndpoint',
  'mapcacheEndpoint',
  'pandaWebsocketEndpoint',
  'paymentJavaEndpoint',
  'paymentPhpEndpoint',
  'portalDomainEndpoint',
  'portalSubdomain',
  'ssoEndpoint',
  'webservicesEndpoint',
  'websocketEndpoint',
  'hcpoHcmEndpoint',
]);

const norm = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const outDir = process.argv[2] ?? './out';

/** Recursively collect every ws:// or wss:// string in the payload, with its JSON path. */
function findSocketUrls(node, path = '$', found = []) {
  if (typeof node === 'string') {
    if (/^wss?:\/\//i.test(node)) found.push({ path, value: node });
    return found;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => findSocketUrls(v, `${path}[${i}]`, found));
    return found;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) findSocketUrls(v, `${path}.${k}`, found);
  }
  return found;
}

/** Recursively collect keys whose name hints at a realtime channel. */
function findSuspiciousKeys(node, path = '$', found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((v, i) => findSuspiciousKeys(v, `${path}[${i}]`, found));
    return found;
  }
  for (const [k, v] of Object.entries(node)) {
    if (/socket|kestrel|panda|realtime|stream|mqtt|pubsub|topic/i.test(k)) {
      found.push({ path: `${path}.${k}`, key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
    }
    findSuspiciousKeys(v, `${path}.${k}`, found);
  }
  return found;
}

function endpointsOf(doc) {
  const raw = doc?.globalConfiguration && typeof doc.globalConfiguration === 'object' ? doc.globalConfiguration : doc;
  return raw?.endPoints ?? raw?.endpoints ?? {};
}

const files = readdirSync(outDir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`No .json files in ${outDir}`);
  process.exit(1);
}

const shapes = new Map();

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(outDir, file), 'utf8'));
  } catch {
    console.log(`\n### ${file}\n  (not valid JSON — skipped)`);
    continue;
  }

  const eps = endpointsOf(doc);
  const keys = Object.keys(eps).sort();
  const unparsed = keys.filter((k) => !PARSED_KEYS.has(norm(k)));
  const sockets = findSocketUrls(doc);
  const suspicious = findSuspiciousKeys(doc);

  shapes.set(file, keys.join(','));

  console.log(`\n### ${file}`);
  console.log(`  endpoint keys: ${keys.length}`);

  if (unparsed.length) {
    console.log(`  *** UNPARSED BY node-chargepoint (${unparsed.length}) ***`);
    for (const k of unparsed) {
      const v = eps[k];
      console.log(`      ${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  } else {
    console.log('  (no unparsed endpoint keys)');
  }

  if (sockets.length) {
    console.log(`  websocket URLs (${sockets.length}):`);
    for (const s of sockets) console.log(`      ${s.path} = ${s.value}`);
  }

  const extraSuspicious = suspicious.filter((s) => !s.path.match(/\.(endPoints|endpoints)\./));
  if (extraSuspicious.length) {
    console.log('  realtime-ish keys OUTSIDE endPoints:');
    for (const s of extraSuspicious) console.log(`      ${s.path} = ${s.value.slice(0, 120)}`);
  }
}

console.log('\n### variant comparison');
const baseline = shapes.get('baseline-na.json');
let anyDiff = false;
for (const [file, shape] of shapes) {
  if (file === 'baseline-na.json') continue;
  if (shape !== baseline) {
    anyDiff = true;
    const b = new Set((baseline ?? '').split(','));
    const s = new Set(shape.split(','));
    const added = [...s].filter((k) => !b.has(k));
    const removed = [...b].filter((k) => !s.has(k));
    console.log(`  ${file}: DIFFERS  +[${added.join(', ')}]  -[${removed.join(', ')}]`);
  }
}
if (!anyDiff) console.log('  all variants returned the same endpoint key set');
