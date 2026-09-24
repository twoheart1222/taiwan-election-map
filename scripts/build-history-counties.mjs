import { readFile, writeFile } from 'node:fs/promises';

const sourceUrl = new URL('../data/counties.json', import.meta.url);
const outputUrl = new URL('../data/history/counties.topo.json', import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, 'utf8'));
const [objectName] = Object.keys(source.objects || {});
const object = source.objects?.[objectName];

if (!object || !Array.isArray(object.geometries) || object.geometries.length !== 22) {
  throw new Error('Expected the source topology to contain 22 county geometries.');
}

const geometries = object.geometries.map(geometry => ({
  type: geometry.type,
  arcs: geometry.arcs,
  ...(geometry.id == null ? {} : { id: geometry.id }),
  properties: {
    id: geometry.properties?.id,
    name: geometry.properties?.name,
    category: geometry.properties?.category,
  },
}));

const output = {
  type: source.type,
  ...(source.bbox ? { bbox: source.bbox } : {}),
  transform: source.transform,
  objects: {
    [objectName]: {
      type: object.type,
      geometries,
    },
  },
  arcs: source.arcs,
};

await writeFile(outputUrl, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`Built ${outputUrl.pathname.split('/').pop()} with ${geometries.length} counties.`);
