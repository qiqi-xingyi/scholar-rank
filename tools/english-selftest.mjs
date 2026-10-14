import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCSV, toObjects, casMetadata } from './cas-data.mjs';
import '../src/lib/settings.js';
import '../src/lib/normalize.js';
import '../src/lib/ranking.js';
const root = new URL('../', import.meta.url);
const read = (name) => JSON.parse(fs.readFileSync(new URL(`src/data/${name}.json`, root)));
const data = { ccf: read('ccf'), core: read('core'), journals: read('journals'), aliases: read('aliases') };
const rank = new SRRanking(data);
const texts = (venue) => rank.badges(rank.lookup(venue)).map((badge) => badge.text);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`ok    ${name}`); }

check('Default conference badges show acronym, CCF and CORE', () => {
  assert.deepEqual(texts('CVPR'), ['CVPR', 'CCF A', 'CORE A*']);
  assert.deepEqual(texts('NeurIPS'), ['NeurIPS', 'CCF A', 'CORE A*']);
  assert.deepEqual(texts('WACV'), ['WACV', 'CORE A']);
});
check('Proceedings do not receive journal metrics', () => {
  assert.deepEqual(texts('Proceedings of the VLDB Endowment 16 (4), 700-712'), ['VLDB', 'CCF A', 'CORE A*']);
});
check('Journal short name precedes the requested journal metrics', () => {
  assert.deepEqual(texts('IEEE Transactions on Information Forensics and Security'), [
    'TIFS', 'JCR Q1', 'CAS 1', 'IF 8.7',
    'TOP',
  ]);
});
check('Non-TOP status is explicit', () => {
  assert(texts('Multimedia Systems 30 (6), 351').includes('Non-TOP'));
});
check('Unknown TOP status is not treated as Non-TOP, and zero IF is preserved', () => {
  const badges = rank.badges({ kind: 'normal', journal: { n: 'Example', q: 'Q2', if: 0 } });
  assert.deepEqual(badges.map((badge) => badge.text), ['JCR Q2', 'IF 0']);
});
check('Preprints, ambiguous venues and secondary tracks remain excluded from rankings', () => {
  assert.deepEqual(texts('arXiv preprint arXiv:2401.12345'), ['arXiv']);
  assert.deepEqual(texts('Information …'), []);
  assert.deepEqual(texts('CVPR 2024 Workshops, 1-8'), []);
});
check('Removed options cannot re-enable deleted badges', () => {
  const legacy = new SRRanking(data, { showTags: true, showCasSub: true, showAbdc: true, showJournalCcf: true, showEi: true });
  assert.deepEqual(legacy.badges(legacy.lookup('IEEE Transactions on Information Forensics and Security')).map((badge) => badge.text), texts('IEEE Transactions on Information Forensics and Security'));
  assert.deepEqual(legacy.badges(legacy.lookup('NeurIPS')).map((badge) => badge.text), ['NeurIPS', 'CCF A', 'CORE A*']);
});
check('Supported switches remain independent', () => {
  const custom = new SRRanking(data, { showConferenceName: false, showCas: false });
  assert.deepEqual(custom.badges(custom.lookup('CVPR')).map((badge) => badge.text), ['CCF A', 'CORE A*']);
  const journal = custom.badges(custom.lookup('IEEE Transactions on Information Forensics and Security'));
  assert.deepEqual(journal.map((badge) => badge.text), ['TIFS', 'JCR Q1', 'IF 8.7', 'TOP']);
});
check('CAS source parser preserves broad-category tier and explicit TOP status', () => {
  const csv = '\ufeffJournal,大类,大类分区,Top,小类1,小类1分区\r\nExample,计算机科学,1 [1/100],否," COMPUTER SCIENCE, THEORY & METHODS 计算机：理论方法",2 [2/100]\r\n';
  assert.deepEqual(casMetadata(toObjects(parseCSV(csv))[0]), { cat: 'Computer Science', zone: 1, top: 0 });
  assert.equal(casMetadata({ Top: '' }).top, undefined);
  assert.throws(() => casMetadata({ 大类: '未知分类' }), /Unknown CAS category/);
});
check('Bundled journal categories are English and subcategory payloads have been removed', () => {
  for (const journal of Object.values(data.journals.journals)) {
    if (journal.cat) assert(!/\p{Script=Han}/u.test(journal.cat));
    assert(!('sub' in journal)); assert(!('subs' in journal));
  }
});
check('Conference abbreviations and publisher-prefixed spellings are recognized', () => {
  for (const [venue, expected] of [
    ['WHC', ['WHC', 'CCF C']], ['World Haptics', ['WHC', 'CCF C']],
    ['MM', ['ACM MM', 'CCF A', 'CORE A*']], ['ACM Multimedia', ['ACM MM', 'CCF A', 'CORE A*']],
    ['ACM KDD', ['KDD', 'CCF A', 'CORE A*']], ['IEEE S&P', ['S&P', 'CCF A', 'CORE A*']],
    ['IEEE SP', ['S&P', 'CCF A', 'CORE A*']], ['USENIX SEC', ['USENIX Security', 'CCF A', 'CORE A*']],
    ['USENIX ATC', ['USENIX ATC', 'CCF A', 'CORE A']], ['IJCRS', ['IJCRS', 'CORE C']],
  ]) assert.deepEqual(texts(venue), expected, venue);
});
check('Named aliases distinguish the two conferences called FSE', () => {
  for (const venue of ['ESEC/FSE', 'ESEC-FSE', 'ACM ESEC/FSE']) {
    assert.deepEqual(texts(venue), ['FSE', 'CCF A', 'CORE A*']);
    assert.match(rank.lookup(venue).ccf.name, /Foundations of Software Engineering/);
  }
  assert.match(rank.lookup('Fast Software Encryption').ccf.name, /Fast Software Encryption/);
  assert.equal(rank.lookup('Fast Software Encryption').ccf.rank, 'B');
});
check('Verified additional names do not invent CCF or CORE rankings', () => {
  for (const [venue, acronym] of [
    ['COLM', 'COLM'], ['Conference on Language Modeling', 'COLM'],
    ['Proceedings of the Conference on Language Modeling 2025', 'COLM'],
    ['RSS', 'RSS'], ['Robotics: Science and Systems', 'RSS'],
  ]) {
    assert.deepEqual(texts(venue), [acronym]);
    assert(!rank.lookup(venue).ccf && !rank.lookup(venue).core);
  }
  for (const venue of ['COLM Workshops', 'RSS 2025 Workshop', 'Conference on Language …']) assert.deepEqual(texts(venue), []);
});
check('Every catalog conference has a short display name', () => {
  for (const catalog of [data.ccf, data.core]) for (const entry of catalog.entries) {
    if (entry.type === 'journal') continue;
    assert(entry.abbr.trim(), entry.name);
    const label = rank.conferenceLabel(entry);
    assert(label.length <= 24, label);
    assert(!/\(was /i.test(label), label);
  }
});
check('Chinese journal names remain matchable without optional journal badges', () => {
  assert.equal(rank.lookup('管理科学学报 27 (1), 1-15').journal.n, '管理科学学报');
  assert.deepEqual(texts('管理科学学报 27 (1), 1-15'), []);
});
check('Every conference tooltip uses English field names', () => {
  for (const type of ['ccf', 'core']) for (const entry of data[type].entries) {
    if (entry.type === 'journal') continue;
    for (const badge of rank.badges({ kind: 'normal', [type]: entry })) assert(!/\p{Script=Han}/u.test(badge.title));
  }
});
check('PNAS full names and citation abbreviations identify the same journal', () => {
  const official = 'Proceedings of the National Academy of Sciences of the United States of America';
  const record = rank.lookup(official).journal;
  assert(record && record.issn === '0027-8424');
  for (const venue of ['PNAS', 'PNAS 121 (1), e123456', 'PNAS 2024', 'PNAS USA',
    'Proceedings of the National Academy of Sciences', 'Proc. Natl. Acad. Sci. USA 121 (1), e123456',
    'Proc. Natl. Acad. Sci. U.S.A.', 'Proc Natl Acad Sci U S A']) {
    assert.equal(rank.lookup(venue).journal, record, venue);
    assert.deepEqual(texts(venue), texts(official));
  }
  const badges = rank.badges(rank.lookup(official));
  assert.deepEqual(badges.map((badge) => badge.key), ['journal', 'jcr', 'cas', 'if', 'top']);
  assert.equal(badges[0].text, 'PNAS');
  assert.equal(badges[0].title, record.n);
});
check('Journal acronyms do not leak into similar names or ambiguous truncations', () => {
  for (const venue of ['PNAS Nexus', 'PNAS …',
    'Proceedings of the National Academy of Sciences India Section A-Physical Sciences',
    'Proceedings of the National Academy of Sciences of Belarus-Agrarian Series']) {
    assert(!rank.badges(rank.lookup(venue)).some((badge) => badge.text === 'PNAS'), venue);
  }
  assert.deepEqual(texts('PNAS …'), []);
});
check('Curated journal acronyms match full titles and can be hidden independently', () => {
  assert.deepEqual(rank.missingJournalAliases, []);
  const hidden = new SRRanking(data, { showJournalName: false });
  for (const entry of data.aliases.journalNames) {
    const result = rank.lookup(entry.name);
    const badges = rank.badges(result);
    assert.equal(badges[0].key, 'journal', entry.name);
    assert.equal(badges[0].text, entry.abbr, entry.name);
    assert.equal(rank.lookup(entry.abbr).journal, result.journal, entry.abbr);
    assert(!result.core && result.ccf?.type !== 'conference', entry.abbr);
    assert.deepEqual(hidden.badges(hidden.lookup(entry.name)), badges.slice(1), entry.name);
  }
  assert.deepEqual(texts('CVPR'), ['CVPR', 'CCF A', 'CORE A*']);
});
check('Nature, Science and Cell names lead their metric badges', () => {
  for (const [name, issn] of [['Nature', '0028-0836'], ['Science', '0036-8075'], ['Cell', '0092-8674']]) {
    for (const venue of [name, `${name} 185 (12), 100-120`, name.toLowerCase(), name.toUpperCase()]) {
      const result = rank.lookup(venue);
      assert.equal(result.journal?.issn, issn, venue);
      const badges = rank.badges(result);
      assert.equal(badges[0].key, 'journal', venue);
      assert.equal(badges[0].text, name, venue);
      assert.deepEqual(badges.map((badge) => badge.key), ['journal', 'jcr', 'cas', 'if', 'top'], venue);
    }
  }
});
check('Flagship journal names are not applied to their related titles', () => {
  for (const venue of ['Nature Communications', 'Nature Medicine', 'Science Advances', 'Cancer Cell', 'Cell Stem Cell']) {
    assert(!rank.badges(rank.lookup(venue)).some((badge) => badge.key === 'journal' && ['Nature', 'Science', 'Cell'].includes(badge.text)), venue);
  }
  for (const venue of ['Nature …', 'Science …', 'Cell …']) assert.deepEqual(texts(venue), [], venue);
});
check('Nature Communications and Science Advances show their own abbreviations first', () => {
  for (const [name, label, issn, aliases] of [
    ['Nature Communications', 'Nat. Commun.', '2041-1723', ['Nat Commun', 'Nat. Commun. 16 (1), 12345', 'Nature Commun.']],
    ['Science Advances', 'Sci. Adv.', '2375-2548', ['Sci Adv', 'Sci. Adv. 11 (1), e123456', 'Science Adv.']],
  ]) {
    const record = rank.lookup(name).journal;
    assert.equal(record.issn, issn);
    for (const venue of [name, ...aliases]) {
      const result = rank.lookup(venue);
      assert.equal(result.journal, record, venue);
      const badges = rank.badges(result);
      assert.equal(badges[0].key, 'journal', venue);
      assert.equal(badges[0].text, label, venue);
      assert.equal(badges[0].title, record.n, venue);
      assert.deepEqual(badges.map((badge) => badge.key), ['journal', 'jcr', 'cas', 'if', 'top']);
    }
  }
});
check('Compact CAS and TOP labels retain their detailed explanations', () => {
  const badges = rank.badges(rank.lookup('Nature Communications'));
  const cas = badges.find((badge) => badge.key === 'cas');
  assert.equal(cas.text, 'CAS 1');
  assert.match(cas.title, /Broad category: Multidisciplinary, Tier 1/);
  assert.match(cas.title, /Chinese Academy of Sciences/);
  const top = badges.find((badge) => badge.key === 'top');
  assert.equal(top.text, 'TOP');
  assert.match(top.title, /CAS 2025 TOP journal: Yes/);
});
check('Journal short names also work in Scholar search-result bylines', () => {
  const venues = SRNorm.venuesFromByline('Example Author - PNAS, 2024 - pnas.org');
  assert(venues.some((venue) => texts(venue)[0] === 'PNAS'));
});
check('Generic preprint labels are English', () => {
  assert.deepEqual(texts('working paper'), ['Working paper']);
  assert.deepEqual(texts('preprint'), ['Preprint']);
});
check('Settings and matching engine have identical shared defaults', () => {
  for (const [key, value] of Object.entries(SRSettings.DEFAULTS)) {
    if (key in SRRanking.DEFAULTS) assert.equal(value, SRRanking.DEFAULTS[key], key);
  }
  const html = fs.readFileSync(new URL('src/options/options.html', root), 'utf8');
  for (const match of html.matchAll(/data-key="([^"]+)"/g)) assert(match[1] in SRSettings.DEFAULTS, match[1]);
  assert(!/showTags|showCasSub|showAbdc|showJournalCcf/.test(html));
  assert(!/\p{Script=Han}/u.test(html));
  assert(!/\p{Script=Han}/u.test(fs.readFileSync(new URL('src/popup/popup.html', root), 'utf8')));
});
console.log(`\n${checks} English badge and data checks passed`);
