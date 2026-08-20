const fs = require('fs');
const crypto = require('crypto');

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node generate_cyclonedx_from_pnpm.js <pnpm-list.json> <output.json>');
const tree = JSON.parse(fs.readFileSync(input, 'utf8'));
const root = tree[0];
if (!root?.name || !root?.version) throw new Error('pnpm list JSON does not contain a valid workspace root');

const components = new Map();
const dependencies = new Map();
function refFor(name, version) {
  return `${name}@${version}`;
}
function walk(name, node) {
  const version = String(node.version || 'unknown');
  const ref = refFor(name, version);
  if (!components.has(ref)) {
    const component = {
      type: node.version?.startsWith?.('link:') ? 'library' : 'library',
      name,
      version,
      'bom-ref': ref,
    };
    if (node.resolved) component.externalReferences = [{ type: 'distribution', url: node.resolved }];
    components.set(ref, component);
  }
  const children = Object.entries(node.dependencies || {});
  dependencies.set(ref, children.map(([childName, child]) => refFor(childName, String(child.version || 'unknown'))));
  for (const [childName, child] of children) walk(childName, child);
}
const rootRef = refFor(root.name, root.version);
const rootNode = { ...root, dependencies: root.dependencies || {} };
walk(root.name, rootNode);
const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: 'CMS', name: 'pnpm-list-to-cyclonedx', version: '1.0.0' }],
    component: { type: 'application', name: root.name, version: root.version, 'bom-ref': rootRef },
  },
  components: [...components.values()].filter((component) => component['bom-ref'] !== rootRef).sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])),
  dependencies: [...dependencies.entries()].map(([ref, dependsOn]) => ({ ref, dependsOn: [...new Set(dependsOn)].sort() })).sort((a, b) => a.ref.localeCompare(b.ref)),
};
fs.writeFileSync(output, JSON.stringify(bom, null, 2) + '\n');
console.log(`Generated CycloneDX 1.5 SBOM with ${bom.components.length} components.`);
