import { readFile, readdir, writeFile } from 'node:fs/promises';

// Build the migration input from the same checkout deployed to the frontend.
// Only used when importing legacy KV documents for the first time.
const root = new URL('../', import.meta.url);
const files = ['data/counties.json'];
for (const dir of ['towns', 'villages']) {
  for (const name of (await readdir(new URL(`data/${dir}/`, root))).sort()) {
    if (name.endsWith('.json')) files.push(`data/${dir}/${name}`);
  }
}
const baseline = {};
for (const path of files) {
  const topo = JSON.parse(await readFile(new URL(path, root), 'utf8'));
  for (const object of Object.values(topo.objects)) {
    for (const { properties: props } of object.geometries) {
      baseline[props.id] = Object.fromEntries(
        ['candidates', 'councilors', 'representatives', 'voters', 'quota']
          .filter(key => Object.hasOwn(props, key)).map(key => [key, props[key]]));
    }
  }
}
await writeFile(new URL('storage-baseline.json', root), JSON.stringify(baseline));
console.log(`Built migration baseline for ${Object.keys(baseline).length} areas.`);
