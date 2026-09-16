import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDERS, CALTRANS_DISTRICTS, catalogUrl, catalogViaRelay, normaliseCaltrans,
  frameUrl, frameViaRelay, nearest, rangeLabel, measurability, catalogRoute,
  provider, credits,
} from '../../public/black-optic-6/js/trafficcam.js';
import {
  SOURCES, chooseSource, SPANS, gdeltQuery, gdeltViaRelay, parseGdeltTime,
  parseGdelt, emptyVerdict, caveat, creditFor,
} from '../../public/black-optic-6/js/newsfeed.js';

const NAPA = { lat: 38.2975, lon: -122.2869 };

const row = (over = {}) => ({
  cctv: {
    inService: 'true',
    location: {
      latitude: String(over.lat ?? 38.30),
      longitude: String(over.lon ?? -122.29),
      locationName: over.locationName ?? 'TV501 -- SR-29 : At Trancas St',
      nearbyPlace: over.nearbyPlace ?? 'Napa',
      route: 'SR-29',
      direction: 'North',
      elevation: '60',
    },
    imageData: { static: { currentImageURL: over.imageUrl ?? 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv501.jpg' } },
    ...over.cctv,
  },
});

/* ------------------------------------------------------------- cameras */

test('the Caltrans catalog URL matches the published per-district pattern', () => {
  assert.equal(catalogUrl(4), 'https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json');
  assert.equal(catalogUrl(11), 'https://cwwp2.dot.ca.gov/data/d11/cctv/cctvStatusD11.json');
  assert.equal(catalogUrl(0), null);
  assert.equal(catalogUrl(13), null);
  assert.equal(catalogUrl('four'), null);
});

test('the ranch district is named as such so nobody has to look it up', () => {
  const home = CALTRANS_DISTRICTS.filter((d) => d.home);
  assert.equal(home.length, 1);
  assert.equal(home[0].id, 4);
  assert.match(home[0].name, /Napa/);
  assert.equal(CALTRANS_DISTRICTS.length, 12);
});

test('out-of-service, unplaceable and off-host cameras are all dropped', () => {
  const parsed = normaliseCaltrans({
    data: [
      row(),
      row({ cctv: { inService: 'false' } }),
      row({ lat: 'n/a' }),
      row({ imageUrl: 'https://someone-else.example/frame.jpg' }),
      row({ imageUrl: '' }),
    ],
  }, 4);
  assert.equal(parsed.cameras.length, 1, 'only the good record survives');
  assert.equal(parsed.skipped, 4);
  assert.equal(parsed.claimed, 5);
});

test('the image URL is pinned to the official host', () => {
  // Defence in depth: a malformed catalog must not be able to point this
  // console at an arbitrary address.
  const parsed = normaliseCaltrans({ data: [row({ imageUrl: 'http://cwwp2.dot.ca.gov/x.jpg' })] }, 4);
  assert.equal(parsed.cameras.length, 0, 'plain http is not the official host either');
});

test('the camera code is lifted from the location name and the label cleaned up', () => {
  const [camera] = normaliseCaltrans({ data: [row()] }, 4).cameras;
  assert.equal(camera.id, 'ca-d4-tv501');
  assert.equal(camera.name, 'SR-29 : At Trancas St (Napa)');
  assert.equal(camera.provider, 'caltrans');
  assert.equal(camera.lat, 38.30);
});

test('a catalog with no data array is empty rather than an exception', () => {
  assert.deepEqual(normaliseCaltrans(null, 4).cameras, []);
  assert.deepEqual(normaliseCaltrans({}, 4).cameras, []);
  assert.equal(normaliseCaltrans({ data: 'nope' }, 4).claimed, 0);
});

test('frames get a cache-buster, or a browser shows an hour-old still', () => {
  const [camera] = normaliseCaltrans({ data: [row()] }, 4).cameras;
  assert.equal(frameUrl(camera, 1700000000000), 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv501.jpg?_=1700000000000');
  const withQuery = frameUrl({ imageUrl: 'https://cwwp2.dot.ca.gov/a.jpg?size=full' }, 42);
  assert.equal(withQuery, 'https://cwwp2.dot.ca.gov/a.jpg?size=full&_=42');
  assert.equal(frameUrl(null), null);
  assert.equal(frameUrl({}), null);
});

test('the relay address keeps the upstream path and stays same-origin', () => {
  const [camera] = normaliseCaltrans({ data: [row()] }, 4).cameras;
  const url = frameViaRelay(camera, 7);
  assert.equal(url, '/relay/caltrans/data/d4/cctv/image/tv501.jpg?_=7');
  assert.ok(url.startsWith('/'), 'a relay URL must be relative or it is not same-origin');
  assert.equal(catalogViaRelay(4), '/relay/caltrans/d4/cctv.json');
  assert.equal(frameViaRelay({ imageUrl: 'not a url' }), null);
});

test('nearest sorts by range and honours the count and radius', () => {
  const cameras = normaliseCaltrans({
    data: [
      row({ lat: 38.30, lon: -122.29, locationName: 'TV1 -- close' }),
      row({ lat: 37.77, lon: -122.42, locationName: 'TV2 -- san francisco' }),
      row({ lat: 38.44, lon: -122.71, locationName: 'TV3 -- santa rosa' }),
    ],
  }, 4).cameras;

  const near = nearest(cameras, NAPA, 3);
  assert.equal(near.length, 3);
  for (let i = 1; i < near.length; i += 1) assert.ok(near[i].rangeKm >= near[i - 1].rangeKm);
  assert.equal(near[0].id, 'ca-d4-tv1');

  assert.equal(nearest(cameras, NAPA, 1).length, 1);
  assert.equal(nearest(cameras, NAPA, 9, 10).length, 1, 'only one camera is within 10 km');
  assert.deepEqual(nearest(cameras, null), []);
});

test('a range label reads the way the rest of the console prints one', () => {
  const [camera] = nearest(normaliseCaltrans({ data: [row()] }, 4).cameras, NAPA, 1);
  assert.match(rangeLabel(camera), /^\d+\.\d km [NSEW]+$/);
  assert.equal(rangeLabel(null), '—');
});

test('a cross-origin frame displays but cannot be measured', () => {
  const [camera] = normaliseCaltrans({ data: [row()] }, 4).cameras;
  const direct = measurability(camera, { pageOrigin: 'https://example.github.io' });
  assert.equal(direct.display, true, 'an img tag needs no CORS — the picture still appears');
  assert.equal(direct.analysable, false, 'but every measurement in this console reads pixels back');
  assert.match(direct.reason, /taint|read back/i);
});

test('through the relay it becomes measurable', () => {
  const [camera] = normaliseCaltrans({ data: [row()] }, 4).cameras;
  const relayed = measurability(camera, { pageOrigin: 'https://example.github.io', viaRelay: true });
  assert.equal(relayed.analysable, true);
  assert.equal(relayed.display, true);
});

test('the catalog route is honest about needing the relay', () => {
  const without = catalogRoute({ relayAvailable: false, district: 4 });
  assert.equal(without.ok, false);
  assert.equal(without.state, 'BLOCKED');
  assert.match(without.verdict, /CORS/);
  assert.match(without.verdict, /frames themselves still display/i);

  const with_ = catalogRoute({ relayAvailable: true, district: 4 });
  assert.equal(with_.ok, true);
  assert.equal(with_.state, 'LINK');
  assert.ok(with_.url.startsWith('/relay/'));
});

test('required attributions are marked required and travel with the cameras', () => {
  const tfl = provider('tfl');
  assert.equal(tfl.creditRequired, true, "TfL's terms make the credit a condition, not a courtesy");
  assert.match(tfl.credit, /Powered by TfL Open Data/);
  assert.equal(provider('nope'), null);

  const shown = credits([{ provider: 'caltrans' }, { provider: 'tfl' }, { provider: 'caltrans' }]);
  assert.equal(shown.length, 2, 'one credit per provider, not per camera');
  assert.ok(shown.some((entry) => entry.required));
  for (const entry of PROVIDERS) assert.ok(entry.credit.length > 5, `${entry.id} has no credit`);
});

/* ---------------------------------------------------------------- news */

test('the commercial-use gate defaults away from Google News', () => {
  const picked = chooseSource({});
  assert.equal(picked.source.id, 'gdelt');
  assert.equal(picked.source.commercial, true);
});

test('asking for Google News without declaring personal use substitutes GDELT', () => {
  const picked = chooseSource({ prefer: 'google-news' });
  assert.equal(picked.source.id, 'gdelt');
  assert.equal(picked.substituted, true);
  assert.match(picked.reason, /personal, non-commercial/i);
});

test('declaring personal use allows it, because then the terms do permit it', () => {
  const picked = chooseSource({ prefer: 'google-news', personalUse: true });
  assert.equal(picked.source.id, 'google-news');
  assert.equal(picked.substituted, false);
});

test('every source records its terms and a link to them', () => {
  for (const source of SOURCES) {
    assert.ok(source.terms.length > 30, `${source.id} has no terms`);
    assert.match(source.link, /^https:\/\//);
    assert.equal(typeof source.commercial, 'boolean');
  }
});

test('the GDELT query quotes the place, or it matches half the internet', () => {
  const url = gdeltQuery('Napa County');
  // URLSearchParams encodes a space as '+', not '%20'.
  assert.ok(url.includes('%22Napa+County%22'), url);
  assert.ok(url.includes('sourcelang%3Aenglish'));
  assert.ok(url.includes('format=json'));
  assert.ok(url.includes('timespan=24h'));
  assert.equal(gdeltQuery(''), null);
  assert.equal(gdeltQuery('   '), null);
});

test('the query clamps its own limits and span', () => {
  assert.ok(gdeltQuery('Napa', { max: 9999 }).includes('maxrecords=250'));
  assert.ok(gdeltQuery('Napa', { max: -3 }).includes('maxrecords=1'));
  assert.ok(gdeltQuery('Napa', { span: 'forever' }).includes('timespan=24h'));
  for (const span of SPANS) assert.ok(gdeltQuery('Napa', { span: span.id }).includes(`timespan=${span.id}`));
});

test('a quote in the place name cannot break out of the query', () => {
  const url = gdeltQuery('Na"pa');
  assert.ok(url.includes(encodeURIComponent('"Napa"')));
});

test('the relay address is same-origin and keeps the query', () => {
  const url = gdeltViaRelay('Napa');
  assert.ok(url.startsWith('/relay/gdelt/api/v2/doc/doc?'));
  assert.ok(url.includes('format=json'));
  assert.equal(gdeltViaRelay(''), null);
});

test('GDELT timestamps are parsed, since Date will not touch them', () => {
  assert.equal(parseGdeltTime('20260916T121500Z'), Date.UTC(2026, 8, 16, 12, 15, 0));
  assert.equal(parseGdeltTime('2026-09-16'), null);
  assert.equal(parseGdeltTime(''), null);
  assert.equal(parseGdeltTime(null), null);
});

test('articles with no usable link are dropped as uncheckable', () => {
  const parsed = parseGdelt({
    articles: [
      { url: 'https://example.com/a', title: 'A', seendate: '20260916T120000Z', domain: 'example.com' },
      { url: '', title: 'No link' },
      { url: 'javascript:alert(1)', title: 'Not a page' },
      { url: 'https://example.com/b', title: 'B', seendate: '20260916T130000Z' },
    ],
  });
  assert.equal(parsed.articles.length, 2);
  assert.equal(parsed.dropped, 2);
  assert.equal(parsed.articles[0].title, 'B', 'newest first');
  assert.equal(parsed.articles[1].domain, 'example.com', 'a missing domain is derived from the URL');
});

test('an empty feed is not an all-clear', () => {
  assert.deepEqual(parseGdelt(null).articles, []);
  const said = emptyVerdict('Napa', '24h');
  assert.match(said, /not evidence that nothing happened/i);
  assert.ok(!/all clear/i.test(said));
});

test('the standing caveat still says the two things that matter', () => {
  const text = caveat();
  assert.match(text, /not verified incidents/i);
  assert.match(text, /lag/i);
});

test('the citation GDELT requires is available beside the results', () => {
  const credit = creditFor('gdelt');
  assert.equal(credit.credit, 'GDELT Project');
  assert.match(credit.link, /gdeltproject\.org/);
  assert.equal(creditFor('nope'), null);
});
