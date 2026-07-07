/**
 * Local pure-JavaScript test suite for Oracle Vision X.
 * Run with:  node local-tests.js
 *
 * These tests exercise the pure logic exported from Code.gs (no Google
 * services required), covering every rule the blueprint asks to verify plus
 * the full end-to-end acceptance scenarios.
 */

var O = require('./Code.gs');

var pass = 0, fail = 0;
var failures = [];

function eq(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; failures.push(label + '\n    expected ' + e + '\n    got      ' + a); }
}
function ok(cond, label) { eq(!!cond, true, label); }

/* --------------------------------------------------------------------------
 * normalizeParticipantId
 * ------------------------------------------------------------------------ */
eq(O.normalizeParticipantId(' @Thato-26 '), 'thato26', 'normalize strips + lowercases');
eq(O.normalizeParticipantId('final-test-01'), 'finaltest01', 'normalize removes dashes');
eq(O.normalizeParticipantId(''), '', 'normalize blank -> blank');
eq(O.normalizeParticipantId(null), '', 'normalize null -> blank');
eq(O.normalizeParticipantId('MUSA'), 'musa', 'normalize lowercases');

/* --------------------------------------------------------------------------
 * parseScore
 * ------------------------------------------------------------------------ */
eq(O.parseScore('6+'), 6, '6+ becomes 6');
eq(O.parseScore('0'), 0, 'string 0');
eq(O.parseScore('3'), 3, 'string 3');
eq(O.parseScore(' 3 '), 3, 'whitespace trimmed');
eq(O.parseScore(2), 2, 'number 2');
eq(O.parseScore('-1'), null, 'negative rejected');
eq(O.parseScore('2.5'), null, 'decimal rejected');
eq(O.parseScore(2.5), null, 'numeric decimal rejected');
eq(O.parseScore('abc'), null, 'text rejected');
eq(O.parseScore(''), null, 'blank rejected');
eq(O.parseScore(null), null, 'null rejected');

/* --------------------------------------------------------------------------
 * calculatePoints  (3 / 1 / 0)
 * ------------------------------------------------------------------------ */
eq(O.calculatePoints(2, 1, 2, 1), 3, 'exact 2-1 => 3');
eq(O.calculatePoints(3, 1, 2, 1), 1, 'correct home win => 1');
eq(O.calculatePoints(0, 1, 2, 1), 0, 'wrong result => 0');
eq(O.calculatePoints(1, 1, 3, 3), 1, 'draw predicted, draw happened => 1');
eq(O.calculatePoints(1, 1, 2, 2), 1, 'different draw => 1 (correct result)');
eq(O.calculatePoints(2, 2, 2, 2), 3, 'exact draw => 3');
eq(O.calculatePoints(0, 2, 1, 3), 1, 'away win predicted, away win happened => 1');
eq(O.calculatePoints('6+', 0, 6, 0), 3, '6+ maps to exact');
eq(O.calculatePoints('x', 1, 2, 1), 0, 'unparseable => 0');

/* Acceptance tests 26-28 point math */
eq(O.calculatePoints(2, 4, 2, 4), 3, 'Thato 2-4 vs 2-4 => 3');
eq(O.calculatePoints(3, 1, 2, 1), 1, 'Lerato 3-1 vs 2-1 => 1');
eq(O.calculatePoints(0, 1, 2, 1), 0, 'Musa 0-1 vs 2-1 => 0');

/* --------------------------------------------------------------------------
 * findOfficialSubmissions — duplicate rule
 * ------------------------------------------------------------------------ */
(function () {
  var entries = [
    { timestamp: '2026-07-07T20:30:00', uniqueId: 'final-test-01', name: 'Thato', matchId: 'TEST-01' },
    { timestamp: '2026-07-07T21:00:00', uniqueId: 'FINAL-TEST-01', name: 'Thato', matchId: 'TEST-01' }
  ];
  var res = O.findOfficialSubmissions(entries);
  ok(res[0].official, 'earliest timestamp is official');
  ok(!res[1].official, 'later duplicate is not official');
})();

(function () {
  // Same id + different matches remain separate (both official).
  var entries = [
    { timestamp: 1000, uniqueId: 'a1', name: 'A', matchId: 'M1' },
    { timestamp: 2000, uniqueId: 'a1', name: 'A', matchId: 'M2' }
  ];
  var res = O.findOfficialSubmissions(entries);
  ok(res[0].official && res[1].official, 'same id, different matches both official');
})();

(function () {
  // Same name but different id remain separate.
  var entries = [
    { timestamp: 1000, uniqueId: 'idA', name: 'Sam', matchId: 'M1' },
    { timestamp: 2000, uniqueId: 'idB', name: 'Sam', matchId: 'M1' }
  ];
  var res = O.findOfficialSubmissions(entries);
  ok(res[0].official && res[1].official, 'same name, different id both official');
})();

(function () {
  // Identical timestamps -> earlier stored row wins even after conceptual sort.
  var entries = [
    { timestamp: 5000, uniqueId: 'z', name: 'Z', matchId: 'M1' },
    { timestamp: 5000, uniqueId: 'z', name: 'Z', matchId: 'M1' }
  ];
  var res = O.findOfficialSubmissions(entries);
  ok(res[0].official && !res[1].official, 'tie -> earlier stored row wins');
})();

(function () {
  // Out-of-order timestamps: official is the earliest, not the first row.
  var entries = [
    { timestamp: 9000, uniqueId: 'q', name: 'Q', matchId: 'M1' },
    { timestamp: 1000, uniqueId: 'q', name: 'Q', matchId: 'M1' }
  ];
  var res = O.findOfficialSubmissions(entries);
  ok(!res[0].official && res[1].official, 'sorting-proof: earliest timestamp wins regardless of row');
})();

/* --------------------------------------------------------------------------
 * aggregateLeaderboard + sortLeaderboard — tiebreaks
 * ------------------------------------------------------------------------ */
(function () {
  var scored = [
    { name: 'Zero', normId: 'zero', points: 0, eligibility: O.ELIG_WAITING }, // excluded
    { name: 'Amy',  normId: 'amy',  points: 3, eligibility: O.ELIG_ELIGIBLE },
    { name: 'Bob',  normId: 'bob',  points: 3, eligibility: O.ELIG_ELIGIBLE },
    { name: 'Bob',  normId: 'bob',  points: 1, eligibility: O.ELIG_ELIGIBLE }
  ];
  var agg = O.aggregateLeaderboard(scored);
  eq(agg.length, 2, 'zero-entry / non-eligible excluded from aggregate');
  var sorted = O.sortLeaderboard(agg);
  eq(sorted[0].name, 'Bob', 'higher total points ranks first');
  eq(sorted[0].totalPoints, 4, 'Bob total 4');
  eq(sorted[0].rank, 1, 'rank 1');
  eq(sorted[1].rank, 2, 'rank 2 sequential');
})();

(function () {
  // Tiebreak chain: equal points -> exact scores -> correct results -> name.
  var agg = [
    { normId: 'a', name: 'Alpha',  totalPoints: 3, exactScores: 1, correctResults: 0, entries: 1 },
    { normId: 'b', name: 'Bravo',  totalPoints: 3, exactScores: 0, correctResults: 3, entries: 3 },
    { normId: 'c', name: 'Charlie',totalPoints: 3, exactScores: 1, correctResults: 0, entries: 1 }
  ];
  var s = O.sortLeaderboard(agg);
  // Bravo has 0 exact vs Alpha/Charlie 1 exact -> Bravo last of the three by exact.
  eq([s[0].name, s[1].name, s[2].name], ['Alpha', 'Charlie', 'Bravo'],
     'exact-score tiebreak, then name (Alpha before Charlie)');
  eq([s[0].rank, s[1].rank, s[2].rank], [1, 2, 3], 'sequential ranks, no ties');
})();

(function () {
  // Correct-results breaks tie when points and exact are equal.
  var agg = [
    { normId: 'a', name: 'A', totalPoints: 2, exactScores: 0, correctResults: 2, entries: 2 },
    { normId: 'b', name: 'B', totalPoints: 2, exactScores: 0, correctResults: 1, entries: 2 }
  ];
  var s = O.sortLeaderboard(agg);
  eq(s[0].name, 'A', 'more correct results ranks first');
})();

/* --------------------------------------------------------------------------
 * computeEngineState — full end-to-end acceptance scenarios
 * ------------------------------------------------------------------------ */

// ACCEPTANCE 26: Thato exact score, before and after Final.
(function () {
  var raw = [
    { timestamp: '2026-07-07T20:30:00', name: 'Thato', uniqueId: 'final-test-01',
      matchId: 'TEST-01', homePred: 2, awayPred: 4 }
  ];
  var openMatches = { 'TEST-01': { status: 'Open', actualHome: '', actualAway: '' } };
  var s1 = O.computeEngineState(raw, openMatches);
  eq(s1.entries[0].eligibility, O.ELIG_WAITING, 'before result: Waiting for result');
  eq(s1.entries[0].points, 0, 'before result: 0 points');
  eq(s1.leaderboard.length, 0, 'before result: empty leaderboard');

  var finalMatches = { 'TEST-01': { status: 'Final', actualHome: 2, actualAway: 4 } };
  var s2 = O.computeEngineState(raw, finalMatches);
  eq(s2.entries[0].eligibility, O.ELIG_ELIGIBLE, 'after Final: Eligible');
  eq(s2.entries[0].points, 3, 'after Final: 3 points');
  eq(s2.leaderboard.length, 1, 'leaderboard has 1 row');
  var top = s2.leaderboard[0];
  eq([top.rank, top.name, top.totalPoints, top.exactScores, top.correctResults, top.entries],
     [1, 'Thato', 3, 1, 0, 1],
     'Leaderboard row: 1 | Thato | 3 | 1 | 0 | 1');
})();

// ACCEPTANCE 27 + 28 + 29 combined leaderboard.
(function () {
  var raw = [
    { timestamp: 1, name: 'Thato',  uniqueId: 'final-test-01', matchId: 'TEST-01', homePred: 2, awayPred: 1 }, // exact => 3
    { timestamp: 2, name: 'Lerato', uniqueId: 'lerato',        matchId: 'TEST-01', homePred: 3, awayPred: 1 }, // result => 1
    { timestamp: 3, name: 'Musa',   uniqueId: 'musa',          matchId: 'TEST-01', homePred: 0, awayPred: 1 }, // wrong => 0
    { timestamp: 4, name: 'Dup',    uniqueId: 'lerato',        matchId: 'TEST-01', homePred: 5, awayPred: 0 }  // duplicate of Lerato
  ];
  var matches = { 'TEST-01': { status: 'Final', actualHome: 2, actualAway: 1 } };
  var s = O.computeEngineState(raw, matches);

  eq(s.entries[0].points, 3, 'Thato 3 points');
  eq(s.entries[1].points, 1, 'Lerato 1 point');
  eq(s.entries[2].points, 0, 'Musa 0 points (eligible, wrong)');
  eq(s.entries[2].eligibility, O.ELIG_ELIGIBLE, 'Musa is eligible even at 0 points');
  eq(s.entries[3].eligibility, O.ELIG_DUPLICATE, 'second Lerato entry is Duplicate - Not Scored');
  eq(s.entries[3].points, 0, 'duplicate scores 0');

  // Leaderboard: Musa is eligible (0 pts) so appears; Dup excluded (not eligible).
  var names = s.leaderboard.map(function (r) { return r.name; });
  eq(names, ['Thato', 'Lerato', 'Musa'], 'ranked Thato, Lerato, Musa (Dup excluded)');
  eq(s.leaderboard[0].totalPoints, 3, 'Thato top with 3');
  eq(s.leaderboard.map(function (r) { return r.rank; }), [1, 2, 3], 'sequential ranks');
})();

// Same id + different matches both count independently.
(function () {
  var raw = [
    { timestamp: 1, name: 'Kay', uniqueId: 'kay', matchId: 'M1', homePred: 1, awayPred: 0 },
    { timestamp: 2, name: 'Kay', uniqueId: 'kay', matchId: 'M2', homePred: 2, awayPred: 2 }
  ];
  var matches = {
    'M1': { status: 'Final', actualHome: 1, actualAway: 0 }, // exact 3
    'M2': { status: 'Final', actualHome: 2, actualAway: 2 }  // exact 3
  };
  var s = O.computeEngineState(raw, matches);
  eq(s.entries[0].eligibility, O.ELIG_ELIGIBLE, 'M1 eligible');
  eq(s.entries[1].eligibility, O.ELIG_ELIGIBLE, 'M2 eligible (not a duplicate)');
  eq(s.leaderboard[0].totalPoints, 6, 'Kay accumulates 6 across two matches');
  eq(s.leaderboard[0].entries, 2, 'Kay has 2 counted entries');
})();

// Case-insensitive Final status.
(function () {
  var raw = [{ timestamp: 1, name: 'Neo', uniqueId: 'neo', matchId: 'X', homePred: 1, awayPred: 1 }];
  var matches = { 'X': { status: 'FINAL', actualHome: 1, actualAway: 1 } };
  var s = O.computeEngineState(raw, matches);
  eq(s.entries[0].eligibility, O.ELIG_ELIGIBLE, 'FINAL (uppercase) still scores');
  eq(s.entries[0].points, 3, 'case-insensitive final scored');
})();

/* --------------------------------------------------------------------------
 * Summary
 * ------------------------------------------------------------------------ */
console.log('\n=== ORACLE VISION X — LOCAL TEST RESULTS ===');
console.log('PASS: ' + pass);
console.log('FAIL: ' + fail);
if (fail) {
  console.log('\nFailures:\n - ' + failures.join('\n - '));
  process.exit(1);
} else {
  console.log('\nAll local tests passed. ✅');
}
