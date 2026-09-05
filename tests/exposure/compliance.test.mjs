/**
 * Guardrails.
 *
 * EXPOSURE has hard product constraints — no club marks, no video, no
 * borrowed product names, no place to bet — and constraints that are only
 * written in a brief tend to erode. These tests read the shipped source and
 * fail the build when one of them slips.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { LEGAL } from '../../public/exposure/js/ui/components.js';
import { TEAMS } from '../../public/exposure/js/data/teams.js';
import { BOOKS, bookLink } from '../../public/exposure/js/data/market.js';
import { PROVIDERS } from '../../public/exposure/js/providers.js';
import { allPlayers } from '../../public/exposure/js/data/players.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/exposure');

/** Every shipped file in the app, as `[relative path, contents]`. */
function sourceFiles() {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push([path.relative(ROOT, absolute).split(path.sep).join('/'), fs.readFileSync(absolute, 'utf8')]);
    }
  };
  visit(ROOT);
  return files;
}

test('the two disclosures are carried verbatim', () => {
  assert.equal(
    LEGAL.affiliation,
    'Independent analysis tool. Not affiliated with, endorsed by, or sponsored by the National Football League, its member clubs, or NFL Properties. Team names are used only to identify publicly reported games and players.',
  );
  assert.equal(
    LEGAL.gambling,
    '21+. Betting information is for adults where legal. We are not a sportsbook and do not accept wagers. If you or someone you know has a gambling problem, call 1-800-GAMBLER.',
  );
});

test('no borrowed product name appears anywhere in the app', () => {
  // `NFL Pro\b` deliberately does not match "NFL Properties", which the
  // affiliation disclosure is required to say.
  const banned = [
    /NFL Pro\b/i,
    /All-?22\b/i,
    /coaches'? film/i,
    /RedZone/,
    /NFL\s?\+/,
    /Super Bowl/i,
    /Next Gen Stats/i,
    /\bofficial(ly)?\b/i,
    /\blicen[cs]ed\b/i,
  ];
  for (const [file, source] of sourceFiles()) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(source), `${file} matches banned naming ${pattern}`);
    }
  }
});

test('nothing in the app renders an image, a video or an embed', () => {
  const media = [
    /<img\b/i, /<video\b/i, /<iframe\b/i, /<embed\b/i, /<source\b/i,
    /createElement\(\s*['"](img|video|iframe)['"]/i, /el\(\s*['"]img/i,
  ];
  for (const [file, source] of sourceFiles()) {
    if (file.endsWith('.svg')) continue; // The app's own icon, which carries no club mark.
    for (const pattern of media) {
      assert.ok(!pattern.test(source), `${file} renders media (${pattern})`);
    }
  }
});

test('teams carry text identity only — no mark, logo or club colour field', () => {
  for (const team of Object.values(TEAMS)) {
    assert.deepEqual(Object.keys(team).sort(), ['abbr', 'city', 'conf', 'mascot', 'tint']);
    assert.ok(team.city && team.mascot && team.abbr);
  }
  const [, teamsSource] = sourceFiles().find(([file]) => file.endsWith('data/teams.js'));
  const code = teamsSource.replace(/\/\*\*[\s\S]*?\*\//g, '');
  for (const pattern of [/logo/i, /helmet/i, /wordmark/i, /\.png/i, /\.svg/i]) {
    assert.ok(!pattern.test(code), `teams.js mentions ${pattern}`);
  }
});

test('providers are named in text, with no image asset', () => {
  for (const provider of PROVIDERS) {
    assert.equal(provider.mark.length, 2, `${provider.name} should have a two-letter text mark`);
    assert.ok(!/\.(png|jpg|svg|webp)/i.test(JSON.stringify(provider)));
  }
});

test('the books are invented and every outbound link leaves the app', () => {
  const real = /draftkings|fanduel|betmgm|caesars|bet365|pointsbet|espn ?bet/i;
  for (const book of BOOKS) {
    assert.ok(!real.test(book.name), `${book.name} looks like a real operator`);
    assert.match(bookLink(book.id, 'w1-LAC@KC'), /^https:\/\/example\.com\//);
  }
});

test('there is no wagering surface anywhere in the app', () => {
  const wagering = [/bet ?slip/i, /\bstake\b/i, /\bdeposit\b/i, /cash ?out/i, /\bparlay\b/i, /\bwithdraw/i];
  for (const [file, source] of sourceFiles()) {
    for (const pattern of wagering) {
      // The refusal itself is allowed to name the thing it refuses.
      const offending = source.split('\n').filter((line) => pattern.test(line)
        && !/not a sportsbook|do not accept|no bet slip|be staked|no wallet|takes no wagers|price or settle/i.test(line));
      assert.equal(offending.length, 0, `${file} mentions ${pattern}: ${offending[0]}`);
    }
  }
});

test('players carry no headshot, and receipts are written notes rather than clips', () => {
  for (const p of allPlayers()) {
    assert.ok(!('headshot' in p) && !('photo' in p) && !('image' in p), `${p.name} carries an image field`);
    assert.equal(p.initials.length, 2);
    assert.ok(p.receipts.length >= 3 && p.receipts.length <= 5, `${p.name} has ${p.receipts.length} receipts`);
    for (const note of p.receipts) {
      assert.ok(note.length > 60, `${p.name} has a stub receipt`);
      assert.ok(!/\b(video|clip|highlight|footage)\b/i.test(note), `${p.name} points at video`);
    }
  }
});

test('the shell states the age gate before anything else can render', () => {
  const [, html] = sourceFiles().find(([file]) => file === 'index.html');
  assert.match(html, /id="gate"/);
  assert.ok(html.indexOf('id="gate"') < html.indexOf('id="view"'), 'the gate must precede the app view');
  const [, app] = sourceFiles().find(([file]) => file === 'js/app.js');
  assert.match(app, /setAge\(/);
  assert.match(app, /I am 21 or older/);
});

test('every screen is reachable from the shell', () => {
  const [, app] = sourceFiles().find(([file]) => file === 'js/app.js');
  for (const route of ['onboarding', 'home', 'lineup', 'player', 'exposure', 'market', 'command', 'settings', 'more']) {
    assert.match(app, new RegExp(`\\b${route}:`), `route ${route} is not registered`);
  }
});

test('the service worker precaches every shipped module', () => {
  const [, sw] = sourceFiles().find(([file]) => file === 'sw.js');
  for (const [file] of sourceFiles()) {
    if (!file.endsWith('.js') || file === 'sw.js') continue;
    assert.ok(sw.includes(`./${file}`), `sw.js is missing ${file}`);
  }
});
