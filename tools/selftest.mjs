/** Venue matching and statistics regressions. Journal CCF expectations check matching metadata used by statistics, not visible journal badges. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'normalize.js'), 'utf8'));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'ranking.js'), 'utf8'));
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'stats.js'), 'utf8'));

const read = (f) => JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', f), 'utf8'));
const rank = new globalThis.SRRanking({
  ccf: read('ccf.json'),
  core: read('core.json'),
  journals: read('journals.json'),
  aliases: read('aliases.json'),
});

const CASES = [
  ['IEEE Transactions on Information Forensics and Security 19, 1-14', 'CCF A', 'TOP', 'CAS 1', 'IF '],
  ['Multimedia Systems 30 (6), 351', 'CCF C', 'CAS 4', 'IF '],
  ['IEEE transactions on pattern analysis and machine intelligence 44 (11), 7436-7456', 'CCF A', 'CAS 1'],
  ['Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, 1-10', 'CCF A', 'CORE A*'],
  ['Proceedings of the IEEE/CVF International Conference on Computer Vision, 1-9', 'CCF A', 'CORE A*'],
  ['2023 IEEE International Conference on Robotics and Automation (ICRA), 123-130', 'CCF B', 'CORE A*'],
  ['IEEE/ACM International Workshop on Quality of Service, 2024', 'CCF B', 'CORE B'],
  ['USENIX Workshop on Hot Topics in Storage and File Systems, 2024', 'CCF C'],
  ['Advances in Neural Information Processing Systems 36, 1-12', 'CCF A', 'CORE A*'],
  ['Advances in Neural Information Processing System (NeurIPS 2026)', 'CCF A', 'CORE A*'],
  // Common conference name variants
  ['International Conference on Machine Learning, 1000-1010', 'CCF A', 'CORE A*'],
  ['Proceedings of the International Conference on Learning Representations, 1-12', 'CCF A'],
  ['ICML 2024 - Proceedings of the 41st International Conference on Machine …', 'CCF A'],
  ['Proceedings of the ACM Web Conference 2023, 1000-1010', 'CCF A', 'CORE A*'],
  ['Proceedings of the 29th ACM SIGKDD Conference on Knowledge Discovery and Data Mining', 'CCF A', 'CORE A*'],
  ['Proceedings of the VLDB Endowment 16 (4), 700-712', 'CCF A', 'CORE A*'],
  ['Proceedings of the ACM on Management of Data 1 (2), 1-25', 'CCF A', 'CORE A*'],
  ['Proceedings of the 2023 International Conference on Management of Data, 100-112', 'CCF A'],
  ['Proceedings of the 2023 ACM SIGMOD International Conference on Management of …', 'CCF A'],
  ['2023 IEEE 39th International Conference on Data Engineering (ICDE), 1-13', 'CCF A', 'CORE A*'],
  ['Proceedings of the 42nd ACM SIGMOD-SIGACT-SIGAI Symposium on Principles of Database Systems, 1-12', 'CCF B', 'CORE A*'],
  ['2022 IEEE International Conference on Mobile Data Management (MDM), 1-6', 'CCF C'],
  ['arXiv preprint arXiv:2401.12345', 'arXiv'],
  ['bioRxiv, 2023.01.01.522000', 'bioRxiv'],
  ['medRxiv, 2023.05.01.23289000', 'medRxiv'],
  ['SSRN Electronic Journal', 'SSRN'],
  ['Research Square preprint', 'Research Square'],
  ['32nd USENIX Security Symposium (USENIX Security 23), 1-18', 'CCF A', 'CORE A*'],
  ['Proceedings of the AAAI Conference on Artificial Intelligence 38 (5), 4321-4329', 'CCF A', 'CORE A*'],
  ['Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics', 'CCF A', 'CORE A*'],
  ['ACM Transactions on Graphics (TOG) 42 (4), 1-15', 'CCF A', 'CAS 1'],
  ['IEEE Internet of Things Journal 11 (3), 4000-4012', 'CCF C', 'CAS 2'],
  ['Expert Systems with Applications 240, 122456', 'CCF C', 'CAS 1'],
  ['Computers & Security 138, 103654', 'CCF B', 'CAS 2'],
  ['Nature 615 (7951), 234-240', 'CAS 1'],
  ['Academy of Management Journal 66 (1), 1-20', 'CAS 1', 'IF ', 'TOP'],
  ['The Accounting Review 98 (2), 1-24', 'CAS 2', 'IF '],
  ['American Economic Review 113 (1), 1-30', 'CAS 1', 'IF ', 'TOP'],
  ['Human Relations 77 (4), 700-725', 'CAS 2', 'IF '],
  ['Proceedings of the IEEE/CVF Winter Conference on Applications of Computer Vision, 1-10', 'CORE A'],
  ['International Conference on Artificial Intelligence and Statistics, 100-110', 'CORE A'],
  ['ICASSP 2026-2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP), 1-5', 'CCF B'],
  ['ICASSP 2026-2026 IEEE International Conference on Acoustics, Speech and …', 'CCF B'],
  ['ICASSP 2026 - 2026 IEEE International Conference on …', 'CCF B'],
  ['CVPR 2024 - 2024 IEEE/CVF Conference on Computer Vision and Pattern …', 'CCF A', 'CORE A*'],
  ['IEEE Transactions on Information Forensics and Sec…', 'CCF A', 'CAS 1'],
  ['Proceedings of the 61st Annual Meeting of the Association for Computational …', 'CCF A', 'CORE A*'],
  ['… on Pattern Analysis and Machine Intelligence', 'CCF A', 'TOP', 'CAS 1'],
  ['… on Pattern Analysis and …', 'CCF A', 'TOP', 'CAS 1'],
  ['… Pattern Analysis and …', 'CCF A', 'TOP', 'CAS 1'],
  ['… on Information Forensics and Sec…', 'CCF A', 'CAS 1'],
  ['… Vision and Pattern Recognition', 'CCF A', 'CORE A*'],
  ['… ACM SIGKDD Conference on Knowledge Discovery and Data …', 'CCF A', 'CORE A*'],
  ['IEEE Transactions on Pattern Analysis and Machine Intelligence PP (99), 1-18', 'CCF A', 'CAS 1'],
  ['Pattern Analysis and Applications 27 (1), 12', 'CCF C', 'CAS 4'],
  ['Pattern Analysis and Applic…', 'CCF C', 'CAS 4'],
  ['Information Sciences …', 'CCF B', 'CAS 2'],
  ['Proceedings of the IEEE/CVF conference on computer vision and pattern recognition …', 'CCF A', 'CORE A*'],
  ['Proceedings of the AAAI Conference on Artificial Intelligence 38 (5), 4321 …', 'CCF A', 'CORE A*'],
  ['Proceedings of the 31st ACM International Conference on Multimedia, 1-10', 'CCF A', 'CORE A*'],
  ['2023 IEEE Symposium on Security and Privacy (SP), 1-19', 'CCF A', 'CORE A*'],
  ['Usenix Annual Technical Conference, 1-14', 'CCF A', 'CORE A'],
];

const NEGATIVE = [
  'PhD thesis, Tsinghua University',
  '',
  'IEEE Transactions on …',
  'Proceedings of the …',
  'Journal of …',
  'Pattern Analysis and …',
  '… on Image Processing',
  '… Conference on Computer Vision',
  '… Machine Intelligence',
  '… Analysis …',
  // Nature Communications ≠ Nature，Pattern Recognition Letters ≠ Pattern Recognition
  'Information …',
  'Nature …',
  'Pattern Recognition …',
  'Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition Workshops, 2024',
  'CVPR 2024 Workshops, 1-8',
  'Findings of the Association for Computational Linguistics: EMNLP 2024',
  'Companion Proceedings of the ACM Web Conference 2024',
  'Extended Abstracts of the 2024 CHI Conference on Human Factors in Computing Systems',
  'CVPR 2024 Demo Track',
];

const FORBIDDEN = [
  ['Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, 1-10'],
  ['Nature 615 (7951), 234-240', 'CCF', 'CORE'],
  ['IEEE/RSJ International Conference on Intelligent Robots and Systems, 1-8'],
  ['International Conference on Neural Information Processing, 1-10'],
  ['Advances in Neural Information Processing Systems 36, 1-12', 'arXiv'],
  ['arXiv preprint arXiv:2401.12345', 'CCF', 'CORE', 'CAS', 'EI', 'IF '],
  ['2022 IEEE International Conference on Mobile Data Management (MDM), 1-6'],
  ['Proceedings of the 2023 International Conference on Management of Data, 100-112', 'CCF C'],
  ['… on Pattern Analysis and …', 'CCF C', 'CAS 4'],
  ['… and Pattern Recognition', 'CCF B', 'CAS', 'IF '],
  ['Artificial Intelligence …', 'CCF', 'CAS', 'IF '],
].filter((testCase) => testCase.length > 1);

const NB = ' ';
const BYLINES = [
  [`J Hu, L Shen, G Sun${NB}-${NB}IEEE transactions on pattern analysis and machine intelligence, 2019${NB}-${NB}ieeexplore.ieee.org`,
    'CCF A', 'TOP', 'CAS 1'],
  [`N Shinn, F Cassano, A Gopinath…${NB}-${NB}Advances in neural information processing systems, 2023`,
    'NeurIPS', 'CCF A', 'CORE A*'],
  [`C Packer, S Wooders, K Lin, V Fang…${NB}-${NB}arXiv preprint arXiv:2310.08560, 2023${NB}-${NB}arxiv.org`, 'arXiv'],
  [`J Smith-Jones, A Lee${NB}-${NB}Nature, 2015${NB}-${NB}nature.com`, 'TOP', 'CAS 1'],
  [`JS Park, J O'Brien, CJ Cai…${NB}-${NB}Proceedings of the 36th annual ACM symposium on user interface software and technology, 2023${NB}-${NB}dl.acm.org`,
    'CCF A', 'CORE A*'],
  [`Y Yan, S Zheng, Z Zhu, D Chen, W Zhang…${NB}-${NB}… on Pattern Analysis and …, 2026${NB}-${NB}ieeexplore.ieee.org`,
    'CCF A', 'TOP', 'CAS 1'],
];

const BYLINES_EMPTY = [
  `I Goodfellow, Y Bengio, A Courville${NB}-${NB}2016${NB}-${NB}books.google.com`,
  'Some Author Without Any Separator',
  `H Zhang, X Li, Y Wang, J Chen…${NB}-${NB}Information …, 2026${NB}-${NB}Elsevier`,
];

let failed = 0;

function matchingLabels(venue) {
  const result = rank.lookup(venue);
  const texts = rank.badges(result).map((badge) => badge.text);
  if (result.ccf?.type === 'journal') texts.push(`CCF ${result.ccf.rank}`);
  return texts;
}

for (const [venue, ...expected] of CASES) {
  const texts = matchingLabels(venue);
  const missing = expected.filter((e) => !texts.some((t) => t.startsWith(e)));
  if (missing.length) {
    failed++;
    console.error(`FAIL  ${venue}\n      Expected ${JSON.stringify(missing)}\n      Actual ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    ${venue.slice(0, 62)}  ->  ${texts.join(' ')}`);
  }
}

function badgesForByline(line) {
  const venues = globalThis.SRNorm.venuesFromByline(line);
  for (const v of venues) {
    const texts = matchingLabels(v);
    if (texts.length) return texts;
  }
  return [];
}

for (const [line, ...expected] of BYLINES) {
  const texts = badgesForByline(line);
  const missing = expected.filter((e) => !texts.some((t) => t.startsWith(e)));
  if (missing.length) {
    failed++;
    console.error(`FAIL  [.gs_a] ${line}\n      Expected ${JSON.stringify(missing)}\n      Actual ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    [.gs_a] ${line.slice(0, 48)}  ->  ${texts.join(' ')}`);
  }
}

for (const line of BYLINES_EMPTY) {
  const texts = badgesForByline(line);
  if (texts.length) {
    failed++;
    console.error(`FAIL  [.gs_a] ${line}\n      Expected no badges; actual ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    [.gs_a] ${line.slice(0, 48)}  ->  (no badges)`);
  }
}

for (const [venue, ...banned] of FORBIDDEN) {
  const texts = matchingLabels(venue);
  const leaked = banned.filter((b) => texts.some((t) => t.startsWith(b)));
  if (leaked.length) {
    failed++;
    console.error(`FAIL  ${venue}\n      Forbidden labels ${JSON.stringify(leaked)}\n      Actual ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    ${venue.slice(0, 50)}  ->  No forbidden labels ${JSON.stringify(banned)}`);
  }
}

for (const venue of NEGATIVE) {
  const texts = matchingLabels(venue);
  if (texts.length) {
    failed++;
    console.error(`FAIL  ${venue || '(empty)'}\n      Expected no badges; actual ${JSON.stringify(texts)}`);
  } else {
    console.log(`ok    ${venue || '(empty)'}  ->  (no badges)`);
  }
}

let statsChecks = 0;
function checkStats(condition, message) {
  statsChecks++;
  if (condition) {
    console.log(`ok    [statistics] ${message}`);
  } else {
    failed++;
    console.error(`FAIL  [statistics] ${message}`);
  }
}

checkStats(globalThis.SRStats.isFirstAuthor('K Ding, Y Hu, H Wang', 'Kuiye Ding'), 'Recognize abbreviated first-author names');
checkStats(globalThis.SRStats.isFirstAuthor('K Ding, Y Hu, H Wang', 'Ding Kuiye'), 'Support surname-first profile names');
checkStats(!globalThis.SRStats.isFirstAuthor('Y Hu, K Ding, H Wang', 'Kuiye Ding'), 'Exclude authors who are not listed first');
checkStats(
  globalThis.SRStats.isFirstAuthor('Yuqi Li*, Kuiye Ding*, Chuanguang Yang, Szu-Yu Chen, Yingli Tian', 'Kuiye Ding')
    && !globalThis.SRStats.isFirstAuthor('Yuqi Li*, Kuiye Ding*, Chuanguang Yang, Szu-Yu Chen, Yingli Tian', 'Chuanguang Yang'),
  'Recognize consecutive marked co-first authors',
);
checkStats(globalThis.SRStats.isFirstAuthor('Q Ding, Y Hu', ['Kuiye Ding', 'Q Ding']), 'Support configured author aliases');
checkStats(
  globalThis.SRStats.isFirstAuthor('J Liu, ZJ Zha, R Hong, M Wang, Y Zhang', 'Jiawei Liu (刘嘉威)'),
  'Match initials when the profile name includes a Chinese alias',
);
checkStats(
  globalThis.SRStats.isFirstAuthor('J Liu, L Ji, Y Sun, Y Chiu, H Zhao', 'Jiawei Liu'),
  'Match Jiawei Liu to J Liu',
);
checkStats(
  globalThis.SRStats.isFirstAuthor('刘嘉威、曾井展', 'Jiawei Liu (刘嘉威)'),
  'Expand parenthetical aliases and support localized author separators',
);
checkStats(
  globalThis.SRStats.isFirstAuthor('Other Author†, Jiawei Liu†, Third Author', 'Jiawei Liu'),
  'Recognize dagger-marked co-first authors',
);

const parsedNames = globalThis.SRStats.profileNames('Ding, Kuiye\nK Ding；K Ding');
checkStats(parsedNames.length === 2 && parsedNames[0] === 'Ding, Kuiye', 'Parse and deduplicate aliases without splitting surname commas');
const bilingualNames = globalThis.SRStats.profileNames('Jiawei Liu (刘嘉威)');
checkStats(
  bilingualNames.some((name) => name === '刘嘉威') && bilingualNames.some((name) => /Jiawei Liu/.test(name)),
  'Expand bilingual profile-name aliases',
);

const filterItem = {
  authors: 'K Ding, Y Hu',
  result: { ccf: { rank: 'A' }, journal: { zone: 1 } },
};
checkStats(globalThis.SRStats.matchesFilter(filterItem, 'ccf-a', 'Kuiye Ding'), 'Filter by CCF rank');
checkStats(globalThis.SRStats.matchesFilter(filterItem, 'zone-1', 'Kuiye Ding'), 'Filter by CAS tier');
checkStats(
  globalThis.SRStats.matchesFilter(filterItem, 'first', ['Kuiye Ding'])
    && !globalThis.SRStats.matchesFilter(filterItem, 'ccf-b', ['Kuiye Ding']),
  'Filter first-author papers independently',
);

const statsSummary = globalThis.SRStats.summarize([
  { authors: 'K Ding, Y Hu', result: { ccf: { rank: 'A' }, journal: { zone: 1 } } },
  { authors: 'Y Hu, K Ding', result: { ccf: { rank: 'B' }, journal: { zone: 2 } } },
  { authors: 'Kuiye Ding, H Wang', result: { ccf: { rank: 'C' } } },
  { authors: 'S Ren, K He', result: { journal: { zone: 4 } } },
], 'Kuiye Ding');
checkStats(
  statsSummary.total === 4
    && statsSummary.ccf.A === 1 && statsSummary.ccf.B === 1 && statsSummary.ccf.C === 1
    && statsSummary.zones[1] === 1 && statsSummary.zones[2] === 1
    && statsSummary.zones[3] === 0 && statsSummary.zones[4] === 1
    && statsSummary.firstAuthor === 2,
  'Summarize CCF ranks, CAS tiers and first authorship',
);

const { completesTruncated } = globalThis.SRNorm;
checkStats(completesTruncated('Information Sciences', 'Information …'), 'Validate a completed venue against a truncated prefix');
checkStats(
  completesTruncated('IEEE Transactions on Pattern Analysis and Machine Intelligence', '… on Pattern Analysis and …'),
  'Validate a completed venue against an interior fragment',
);
checkStats(!completesTruncated('Pattern recognition', 'Information …'), 'Reject unrelated italic titles from citation responses');

if (rank.missingAliases.length) {
  failed++;
  console.error('FAIL  aliases.json references missing conference acronyms:');
  for (const m of rank.missingAliases) console.error('      ' + m);
}

const total = CASES.length + BYLINES.length + BYLINES_EMPTY.length + FORBIDDEN.length + NEGATIVE.length + statsChecks;
console.log(`\n${total} checks; ${failed} failures`);
process.exit(failed ? 1 : 0);
