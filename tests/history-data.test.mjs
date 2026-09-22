import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const readJson = async file => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

test('historical election profiles cover every year and normalized county', async () => {
  const [national, countyArchive] = await Promise.all([
    readJson('data/history/presidential.json'),
    readJson('data/history/presidential-counties.json'),
  ]);
  assert.equal(national.elections.length, 8);
  for (const election of national.elections) {
    assert.equal(election.votesCast, election.validVotes + election.invalidVotes, `${election.year} national ballot arithmetic`);
    assert.ok(election.electors > election.votesCast, `${election.year} national electors`);
    const counties = countyArchive.years[String(election.year)].counties;
    assert.equal(Object.keys(counties).length, 22, `${election.year} current county coverage`);
    for (const [name, result] of Object.entries(counties)) {
      assert.equal(result.votesCast, result.validVotes + result.invalidVotes, `${election.year} ${name} ballot arithmetic`);
      assert.ok(result.turnout > 0 && result.turnout <= 100, `${election.year} ${name} turnout`);
    }
  }
});

test('history page script compiles and exposes the overview renderers', async () => {
  const html = await readFile(new URL('../history/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/src=|application\/ld\+json/.test(match[1]));
  scripts.forEach((match, index) => new vm.Script(match[2], { filename: `history/index.html#${index}` }));
  assert.match(html, /function renderInsights\(/);
  assert.match(html, /得票率低於 5% 列為其他/);
});
