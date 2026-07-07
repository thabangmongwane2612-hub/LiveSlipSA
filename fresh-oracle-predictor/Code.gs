/**
 * ============================================================================
 * ORACLE VISION X — LIVE PREDICTOR ENGINE
 * ============================================================================
 *
 * A reusable, white-label football predictor engine built as ONE standalone
 * Google Apps Script project.
 *
 *   Page posts link  ->  Follower predicts  ->  Entry stored automatically
 *   ->  Duplicate rule applied  ->  Match goes Final  ->  Every entry scored
 *   ->  Leaderboard rebuilt  ->  Page posts leaderboard.
 *
 * PRINCIPLE: The Apps Script owns ALL logic. Google Sheets are only storage,
 * operator interface and public output. There are NO spreadsheet formulas for
 * scoring, duplicate detection, aggregation, ranking or sorting.
 *
 * DEPLOY:
 *   1. Create one standalone Apps Script project.
 *   2. Paste this complete file as Code.gs.
 *   3. Run buildFreshOraclePredictor() once.
 *   4. Open the generated Control sheet (URL is logged and stored).
 *   5. Share the Public Form URL with followers.
 *
 * IDs ARE NEVER HARDCODED. buildFreshOraclePredictor() stores the generated
 * Spreadsheet ID and Form ID in Script Properties. Every later function reads
 * them back from there.
 * ============================================================================
 */

/* ===========================================================================
 * SECTION A — CONSTANTS
 * =========================================================================== */

var PROP_SPREADSHEET_ID = 'ORACLE_SPREADSHEET_ID';
var PROP_FORM_ID = 'ORACLE_FORM_ID';

var SPREADSHEET_NAME = 'Oracle Vision X — Live Predictor Engine';

var SHEET_CONTROL = 'Control';
var SHEET_MATCHES = 'Matches';
var SHEET_ENTRIES = 'Entries';
var SHEET_LEADERBOARD = 'Leaderboard';

var DEFAULT_PAGE_NAME = 'Oracle Vision X';
var DEFAULT_MATCH_ID = 'TEST-01';

// Matches sheet columns (1-indexed).
var M_MATCH_ID = 1;   // A
var M_HOME = 2;       // B
var M_AWAY = 3;       // C
var M_ENTRY_CLOSE = 4;// D
var M_ACTUAL_HOME = 5;// E
var M_ACTUAL_AWAY = 6;// F
var M_STATUS = 7;     // G

// Entries sheet columns (1-indexed).
var E_TIMESTAMP = 1;   // A
var E_NAME = 2;        // B
var E_UNIQUE_ID = 3;   // C
var E_MATCH_ID = 4;    // D
var E_HOME_PRED = 5;   // E
var E_AWAY_PRED = 6;   // F
var E_FIRST_SCORER = 7;// G
var E_CONFIDENCE = 8;  // H
var E_ELIGIBILITY = 9; // I
var E_POINTS = 10;     // J

// Eligibility states.
var ELIG_WAITING = 'Waiting for result';
var ELIG_ELIGIBLE = 'Eligible';
var ELIG_DUPLICATE = 'Duplicate - Not Scored';
var ELIG_CLOSED = 'Match Closed';
var ELIG_INVALID = 'Invalid Entry';

// Match statuses.
var STATUS_OPEN = 'Open';
var STATUS_CLOSED = 'Closed';
var STATUS_FINAL = 'Final';

// Stable question titles used by the Form. Score questions carry the team
// names, so they are matched by keyword, not exact string.
var Q_NAME = 'Predictor name';
var Q_UNIQUE = 'Your unique player ID';
var Q_FIRST_SCORER = 'Who scores first?';
var Q_CONFIDENCE = 'How confident are you?';
var Q_GOALS_KEYWORD = 'goals will';

/* ===========================================================================
 * SECTION B — PURE LOGIC (no Google services; unit-testable in Node)
 * =========================================================================== */

/**
 * Build an internal normalized participant key.
 * string -> trim -> lowercase -> keep only a-z and 0-9.
 *   " @Thato-26 " -> "thato26"
 */
function normalizeParticipantId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parse a score choice into a non-negative integer, or return null if invalid.
 *   "6+"  -> 6
 *   "0".."6" -> numeric
 *   negative / decimal / text / blank -> null
 * Preserves the participant's original choice elsewhere; scoring uses this.
 */
function parseScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (isFinite(value) && Math.floor(value) === value && value >= 0) {
      return value;
    }
    return null;
  }
  var s = String(value).trim();
  if (s === '') return null;
  if (s === '6+') return 6;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

/**
 * Result category of a scoreline.
 *   home win -> 'H', away win -> 'A', draw -> 'D'
 */
function resultCategory(home, away) {
  if (home > away) return 'H';
  if (away > home) return 'A';
  return 'D';
}

/**
 * Points for one prediction against an actual result.
 *   exact score            -> 3
 *   correct winner or draw -> 1
 *   wrong result           -> 0
 * Any unparseable input yields 0.
 */
function calculatePoints(predHome, predAway, actualHome, actualAway) {
  var ph = parseScore(predHome);
  var pa = parseScore(predAway);
  var ah = parseScore(actualHome);
  var aa = parseScore(actualAway);
  if (ph === null || pa === null || ah === null || aa === null) return 0;
  if (ph === ah && pa === aa) return 3;
  if (resultCategory(ph, pa) === resultCategory(ah, aa)) return 1;
  return 0;
}

/**
 * Given a list of raw entries, decide which submission is OFFICIAL for each
 * (normalized participant id + match id) pair. Earliest timestamp wins; ties
 * are broken by original stored order (lower index wins). Sorting the sheet
 * never changes the outcome because ordering is by timestamp, not row.
 *
 * @param entries array of {timestamp, uniqueId, name, matchId}
 * @return a new array, index-aligned to input, of shallow copies each with
 *         added fields: index, key, official (boolean)
 */
function findOfficialSubmissions(entries) {
  var annotated = entries.map(function (e, i) {
    var id = normalizeParticipantId(e.uniqueId) || normalizeParticipantId(e.name);
    var ts = toMillis(e.timestamp);
    return {
      index: i,
      key: id + '|' + String(e.matchId),
      ts: ts,
      official: false,
      source: e
    };
  });

  var byKey = {};
  annotated.forEach(function (a) {
    if (!byKey[a.key]) byKey[a.key] = [];
    byKey[a.key].push(a);
  });

  Object.keys(byKey).forEach(function (key) {
    var group = byKey[key];
    group.sort(function (x, y) {
      if (x.ts !== y.ts) return x.ts - y.ts;      // earliest timestamp first
      return x.index - y.index;                    // then earliest stored row
    });
    group[0].official = true;
  });

  // Return index-aligned copies.
  var out = new Array(annotated.length);
  annotated.forEach(function (a) {
    out[a.index] = {
      index: a.index,
      key: a.key,
      official: a.official,
      source: a.source
    };
  });
  return out;
}

/**
 * Convert a timestamp (Date, number of ms, or parseable string) to millis.
 * Unparseable values sort last (very large number) so valid entries win.
 */
function toMillis(ts) {
  if (ts === null || ts === undefined || ts === '') return Number.MAX_SAFE_INTEGER;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  var d = new Date(ts);
  var t = d.getTime();
  return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * Aggregate ONLY eligible official entries into per-participant standings.
 *
 * @param scoredEntries array of {name, normId, points, eligibility}
 * @return array of {normId, name, totalPoints, exactScores, correctResults,
 *                   entries}  (unsorted)
 */
function aggregateLeaderboard(scoredEntries) {
  var byId = {};
  scoredEntries.forEach(function (e) {
    if (e.eligibility !== ELIG_ELIGIBLE) return;
    var id = e.normId;
    if (!byId[id]) {
      byId[id] = {
        normId: id,
        name: e.name,
        totalPoints: 0,
        exactScores: 0,
        correctResults: 0,
        entries: 0
      };
    }
    var row = byId[id];
    row.totalPoints += e.points;
    if (e.points === 3) row.exactScores += 1;
    if (e.points === 1) row.correctResults += 1;
    row.entries += 1;
  });

  return Object.keys(byId).map(function (k) { return byId[k]; });
}

/**
 * Sort standings and assign sequential ranks (no tied rank numbers).
 * Order: Total Points desc, Exact Scores desc, Correct Results desc,
 *        Participant Name ascending.
 *
 * @param aggregates output of aggregateLeaderboard
 * @return sorted array with an added sequential `rank` (1..n)
 */
function sortLeaderboard(aggregates) {
  var rows = aggregates.slice();
  rows.sort(function (a, b) {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
    if (b.correctResults !== a.correctResults) return b.correctResults - a.correctResults;
    var an = String(a.name).toLowerCase();
    var bn = String(b.name).toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });
  rows.forEach(function (r, i) { r.rank = i + 1; });
  return rows;
}

/**
 * The heart of the engine. Given raw entries and a map of matches, decide the
 * eligibility + points of every entry, and build the ranked leaderboard.
 * Pure: no Google services touched.
 *
 * @param rawEntries array of {timestamp, name, uniqueId, matchId,
 *                             homePred, awayPred}
 * @param matchesById object keyed by matchId ->
 *                    {status, actualHome, actualAway}
 * @return { entries: [ {index, eligibility, points, normId, name, matchId} ],
 *           leaderboard: [ ranked rows ] }
 */
function computeEngineState(rawEntries, matchesById) {
  var official = findOfficialSubmissions(rawEntries.map(function (e) {
    return {
      timestamp: e.timestamp,
      uniqueId: e.uniqueId,
      name: e.name,
      matchId: e.matchId
    };
  }));

  var results = rawEntries.map(function (e, i) {
    var normId = normalizeParticipantId(e.uniqueId) || normalizeParticipantId(e.name);
    var match = matchesById[String(e.matchId)] ||
                matchesById[String(e.matchId).toUpperCase()] || null;

    var out = {
      index: i,
      normId: normId,
      name: e.name,
      matchId: e.matchId,
      eligibility: ELIG_WAITING,
      points: 0
    };

    if (!match) {
      out.eligibility = ELIG_INVALID;
      return out;
    }

    if (!official[i].official) {
      out.eligibility = ELIG_DUPLICATE;
      return out;
    }

    var status = String(match.status || '').trim().toLowerCase();
    var hasResult = parseScore(match.actualHome) !== null &&
                    parseScore(match.actualAway) !== null;

    if (status === STATUS_FINAL.toLowerCase() && hasResult) {
      out.eligibility = ELIG_ELIGIBLE;
      out.points = calculatePoints(e.homePred, e.awayPred,
                                   match.actualHome, match.actualAway);
    } else {
      out.eligibility = ELIG_WAITING;
      out.points = 0;
    }
    return out;
  });

  var aggregates = aggregateLeaderboard(results.map(function (r) {
    return { name: r.name, normId: r.normId, points: r.points,
             eligibility: r.eligibility };
  }));
  var leaderboard = sortLeaderboard(aggregates);

  return { entries: results, leaderboard: leaderboard };
}

/* ===========================================================================
 * SECTION C — CONFIG / ID MANAGEMENT (Script Properties, never hardcoded)
 * =========================================================================== */

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function getSpreadsheetId_() {
  var id = getProp_(PROP_SPREADSHEET_ID);
  if (!id) {
    throw new Error('System ID missing. Run buildFreshOraclePredictor once.');
  }
  return id;
}

function getFormId_() {
  var id = getProp_(PROP_FORM_ID);
  if (!id) {
    throw new Error('System ID missing. Run buildFreshOraclePredictor once.');
  }
  return id;
}

function openSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function openForm_() {
  return FormApp.openById(getFormId_());
}

function sheet_(name) {
  var ss = openSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

/* ===========================================================================
 * SECTION D — CONTROL SHEET HELPERS
 * =========================================================================== */

function controlSet_(field, value) {
  var sh = sheet_(SHEET_CONTROL);
  var data = sh.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === field) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  // Field not present: append it.
  sh.appendRow([field, value]);
}

function controlGet_(field) {
  var sh = sheet_(SHEET_CONTROL);
  var data = sh.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === field) return data[i][1];
  }
  return '';
}

/* ===========================================================================
 * SECTION E — MATCH HELPERS
 * =========================================================================== */

/** Return {matchId: {home, away, status, actualHome, actualAway, row}} map. */
function readMatchesMap_() {
  var sh = sheet_(SHEET_MATCHES);
  var data = sh.getDataRange().getValues();
  var map = {};
  for (var r = 1; r < data.length; r++) { // skip header
    var id = String(data[r][M_MATCH_ID - 1]).trim();
    if (!id) continue;
    map[id] = {
      home: data[r][M_HOME - 1],
      away: data[r][M_AWAY - 1],
      entryClose: data[r][M_ENTRY_CLOSE - 1],
      actualHome: data[r][M_ACTUAL_HOME - 1],
      actualAway: data[r][M_ACTUAL_AWAY - 1],
      status: data[r][M_STATUS - 1],
      row: r + 1
    };
  }
  return map;
}

/** The active match id from Control, falling back to the first match row. */
function getActiveMatchId_() {
  var id = String(controlGet_('Active Match ID') || '').trim();
  if (id) return id;
  var sh = sheet_(SHEET_MATCHES);
  if (sh.getLastRow() >= 2) {
    return String(sh.getRange(2, M_MATCH_ID).getValue()).trim();
  }
  return '';
}

function getActiveMatch_() {
  var id = getActiveMatchId_();
  var map = readMatchesMap_();
  return { id: id, match: map[id] || null };
}

function setActiveMatchStatus_(status) {
  var active = getActiveMatch_();
  if (!active.match) throw new Error('No active match found for id: ' + active.id);
  sheet_(SHEET_MATCHES).getRange(active.match.row, M_STATUS).setValue(status);
  controlSet_('System Status', status);
}

/* ===========================================================================
 * SECTION F — CORE REFRESH (recompute duplicates, scoring, leaderboard)
 * =========================================================================== */

/**
 * Recalculate everything from the Entries + Matches sheets and rewrite the
 * Eligibility/Points columns and the whole Leaderboard sheet with plain values.
 */
function refreshEverything() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { /* proceed best-effort */ }

  try {
    var entriesSheet = sheet_(SHEET_ENTRIES);
    var matchesMap = readMatchesMap_();

    var lastRow = entriesSheet.getLastRow();
    var rawEntries = [];
    if (lastRow >= 2) {
      var values = entriesSheet.getRange(2, 1, lastRow - 1, E_POINTS).getValues();
      values.forEach(function (row) {
        rawEntries.push({
          timestamp: row[E_TIMESTAMP - 1],
          name: row[E_NAME - 1],
          uniqueId: row[E_UNIQUE_ID - 1],
          matchId: row[E_MATCH_ID - 1],
          homePred: row[E_HOME_PRED - 1],
          awayPred: row[E_AWAY_PRED - 1]
        });
      });
    }

    var matchesById = {};
    Object.keys(matchesMap).forEach(function (id) {
      matchesById[id] = {
        status: matchesMap[id].status,
        actualHome: matchesMap[id].actualHome,
        actualAway: matchesMap[id].actualAway
      };
    });

    var state = computeEngineState(rawEntries, matchesById);

    // Write Eligibility + Points back (plain values, no formulas).
    if (rawEntries.length > 0) {
      var eligCol = [];
      var pointsCol = [];
      state.entries.forEach(function (e) {
        eligCol.push([e.eligibility]);
        pointsCol.push([e.points]);
      });
      entriesSheet.getRange(2, E_ELIGIBILITY, eligCol.length, 1).setValues(eligCol);
      entriesSheet.getRange(2, E_POINTS, pointsCol.length, 1).setValues(pointsCol);
    }

    writeLeaderboard_(state.leaderboard);

    controlSet_('Last Refresh Time', new Date());
    controlSet_('Last Refresh Result',
      'OK — ' + rawEntries.length + ' entries, ' +
      state.leaderboard.length + ' ranked participants');
    return state;
  } catch (err) {
    try {
      controlSet_('Last Refresh Time', new Date());
      controlSet_('Last Refresh Result', 'ERROR: ' + err.message);
    } catch (ignore) {}
    throw err;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function writeLeaderboard_(leaderboard) {
  var sh = sheet_(SHEET_LEADERBOARD);
  // Clear previous rows (keep header row 1).
  var last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 6).clearContent();
  }
  if (!leaderboard.length) return;
  var out = leaderboard.map(function (r) {
    return [r.rank, r.name, r.totalPoints, r.exactScores, r.correctResults, r.entries];
  });
  sh.getRange(2, 1, out.length, 6).setValues(out);
}

/* ===========================================================================
 * SECTION G — FORM SUBMIT HANDLER
 * =========================================================================== */

/**
 * Installable Form-submit trigger handler. Robust to event-object shape:
 * supports the Form trigger (e.response) and, defensively, a namedValues shape.
 */
function handleOracleFormSubmit(e) {
  var fields = extractFormFields_(e);

  var active = getActiveMatch_();
  var matchId = active.id;
  var match = active.match;

  var homeNum = parseScore(fields.homePred);
  var awayNum = parseScore(fields.awayPred);

  var eligibility = ELIG_WAITING;
  var points = 0;

  if (!match) {
    eligibility = ELIG_INVALID;
  } else if (homeNum === null || awayNum === null) {
    eligibility = ELIG_INVALID;
  } else {
    var status = String(match.status || '').trim().toLowerCase();
    if (status === STATUS_CLOSED.toLowerCase() || status === STATUS_FINAL.toLowerCase()) {
      // New submissions after Open must not become official.
      eligibility = ELIG_CLOSED;
    }
  }

  var entriesSheet = sheet_(SHEET_ENTRIES);
  entriesSheet.appendRow([
    new Date(),                                   // A Timestamp
    fields.name || '',                            // B Participant Name
    fields.uniqueId || '',                        // C Unique ID
    matchId,                                      // D Match ID
    homeNum === null ? '' : homeNum,              // E Home Prediction
    awayNum === null ? '' : awayNum,              // F Away Prediction
    fields.firstScorer || '',                     // G First Scorer
    fields.confidence || '',                      // H Confidence
    eligibility,                                  // I Eligibility (provisional)
    points                                        // J Points
  ]);

  // Recompute duplicates, scoring and leaderboard from scratch.
  refreshEverything();
}

/**
 * Extract the six participant fields from any supported event shape.
 * Score questions carry team names, so they are matched by keyword + order.
 */
function extractFormFields_(e) {
  var out = { name: '', uniqueId: '', homePred: '', awayPred: '',
              firstScorer: '', confidence: '' };

  // Preferred: Form-submit trigger with a FormResponse.
  if (e && e.response && typeof e.response.getItemResponses === 'function') {
    var items = e.response.getItemResponses();
    var goals = [];
    items.forEach(function (ir) {
      var title = String(ir.getItem().getTitle() || '');
      var ans = ir.getResponse();
      if (title.indexOf(Q_NAME) === 0) out.name = ans;
      else if (title.indexOf(Q_UNIQUE) === 0) out.uniqueId = ans;
      else if (title.indexOf(Q_GOALS_KEYWORD) !== -1) goals.push(ans);
      else if (title.indexOf(Q_FIRST_SCORER) === 0) out.firstScorer = ans;
      else if (title.indexOf(Q_CONFIDENCE) === 0) out.confidence = ans;
    });
    out.homePred = goals.length > 0 ? goals[0] : '';
    out.awayPred = goals.length > 1 ? goals[1] : '';
    return out;
  }

  // Fallback: spreadsheet form-submit shape with namedValues.
  if (e && e.namedValues) {
    var nv = e.namedValues;
    var goals2 = [];
    Object.keys(nv).forEach(function (key) {
      var val = Array.isArray(nv[key]) ? nv[key][0] : nv[key];
      if (key.indexOf(Q_NAME) === 0) out.name = val;
      else if (key.indexOf(Q_UNIQUE) === 0) out.uniqueId = val;
      else if (key.indexOf(Q_GOALS_KEYWORD) !== -1) goals2.push(val);
      else if (key.indexOf(Q_FIRST_SCORER) === 0) out.firstScorer = val;
      else if (key.indexOf(Q_CONFIDENCE) === 0) out.confidence = val;
    });
    out.homePred = goals2.length > 0 ? goals2[0] : '';
    out.awayPred = goals2.length > 1 ? goals2[1] : '';
    return out;
  }

  return out;
}

/* ===========================================================================
 * SECTION H — MATCH EDIT HANDLER
 * =========================================================================== */

/**
 * Installable spreadsheet edit trigger. Reacts only to edits of the Matches
 * sheet result columns (E Actual Home, F Actual Away, G Status) below the
 * header, then rescoring + rebuilds the leaderboard automatically.
 */
function handleOracleMatchEdit(e) {
  if (!e || !e.range) return;
  var range = e.range;
  var sheetName = range.getSheet().getName();
  if (sheetName !== SHEET_MATCHES) return;

  var row = range.getRow();
  if (row < 2) return; // ignore header

  var col = range.getColumn();
  var numCols = range.getNumColumns();
  var touchesResult = false;
  for (var c = col; c < col + numCols; c++) {
    if (c === M_ACTUAL_HOME || c === M_ACTUAL_AWAY || c === M_STATUS) {
      touchesResult = true;
      break;
    }
  }
  if (!touchesResult) return;

  refreshEverything();
}

/* ===========================================================================
 * SECTION I — OPERATOR ENTRY POINTS
 * =========================================================================== */

/** Set the active match/system to Open (allow submissions). */
function openEntries() {
  setActiveMatchStatus_(STATUS_OPEN);
  refreshEverything();
  return 'Entries OPEN for match ' + getActiveMatchId_();
}

/** Set the active match/system to Closed (stop accepting valid predictions). */
function closeEntries() {
  setActiveMatchStatus_(STATUS_CLOSED);
  refreshEverything();
  return 'Entries CLOSED for match ' + getActiveMatchId_();
}

/* ===========================================================================
 * SECTION J — BUILD THE WHOLE SYSTEM FROM ZERO
 * =========================================================================== */

/**
 * Create ONE spreadsheet, ONE form, ONE form-submit trigger, ONE edit trigger,
 * store IDs in Script Properties, seed the test match, and wire everything.
 * Run this exactly once per instance.
 */
function buildFreshOraclePredictor() {
  // 1. Spreadsheet ------------------------------------------------------------
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  var spreadsheetId = ss.getId();
  setProp_(PROP_SPREADSHEET_ID, spreadsheetId);

  buildSheets_(ss);

  // 2. Form -------------------------------------------------------------------
  var form = buildFormForActiveMatch_(ss);
  setProp_(PROP_FORM_ID, form.getId());

  // 3. Control sheet population ----------------------------------------------
  populateControl_(ss, form);

  // 4. Triggers ---------------------------------------------------------------
  installTriggers_(ss, form);

  // 5. Initial refresh --------------------------------------------------------
  refreshEverything();

  var url = ss.getUrl();
  Logger.log('BUILD COMPLETE');
  Logger.log('Spreadsheet: ' + url);
  Logger.log('Public Form URL: ' + form.getPublishedUrl());
  Logger.log('Edit Form URL: ' + form.getEditUrl());
  return {
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: url,
    formId: form.getId(),
    publicFormUrl: form.getPublishedUrl(),
    editFormUrl: form.getEditUrl()
  };
}

/** Create the four sheets with headers and seed the test match. */
function buildSheets_(ss) {
  // Control
  var control = ensureSheet_(ss, SHEET_CONTROL);
  control.clear();
  control.getRange(1, 1, 1, 2).setValues([['Field', 'Value']])
         .setFontWeight('bold');
  control.setColumnWidth(1, 180);
  control.setColumnWidth(2, 520);

  // Matches
  var matches = ensureSheet_(ss, SHEET_MATCHES);
  matches.clear();
  matches.getRange(1, 1, 1, 7).setValues([[
    'Match ID', 'Home Team', 'Away Team', 'Entry Close',
    'Actual Home', 'Actual Away', 'Status'
  ]]).setFontWeight('bold');
  matches.getRange(2, 1, 1, 7).setValues([[
    DEFAULT_MATCH_ID, 'Blue Team', 'Red Team', '', '', '', STATUS_OPEN
  ]]);

  // Entries
  var entries = ensureSheet_(ss, SHEET_ENTRIES);
  entries.clear();
  entries.getRange(1, 1, 1, 10).setValues([[
    'Timestamp', 'Participant Name', 'Unique ID', 'Match ID',
    'Home Prediction', 'Away Prediction', 'First Scorer', 'Confidence',
    'Eligibility', 'Points'
  ]]).setFontWeight('bold');

  // Leaderboard
  var lb = ensureSheet_(ss, SHEET_LEADERBOARD);
  lb.clear();
  lb.getRange(1, 1, 1, 6).setValues([[
    'Rank', 'Participant Name', 'Total Points', 'Exact Scores',
    'Correct Results', 'Entries'
  ]]).setFontWeight('bold');

  // Remove the default "Sheet1" if present.
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function ensureSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

/** Fill the Control sheet with live IDs, URLs and defaults. */
function populateControl_(ss, form) {
  var rows = [
    ['Spreadsheet ID', ss.getId()],
    ['Spreadsheet URL', ss.getUrl()],
    ['Form ID', form.getId()],
    ['Public Form URL', form.getPublishedUrl()],
    ['Edit Form URL', form.getEditUrl()],
    ['Active Match ID', DEFAULT_MATCH_ID],
    ['Page Name', DEFAULT_PAGE_NAME],
    ['System Status', STATUS_OPEN],
    ['Created Time', new Date()],
    ['Last Refresh Time', ''],
    ['Last Refresh Result', '']
  ];
  var control = ss.getSheetByName(SHEET_CONTROL);
  control.getRange(2, 1, rows.length, 2).setValues(rows);
}

/* ===========================================================================
 * SECTION K — CREATIVE FORM
 * =========================================================================== */

/**
 * Build a brand-new creative Form for the active match's teams and return it.
 * (Does not touch Script Properties — caller decides whether to store the id.)
 */
function buildFormForActiveMatch_(ss) {
  var active = readActiveTeams_(ss);
  var home = active.home;
  var away = active.away;

  var form = FormApp.create(SPREADSHEET_NAME + ' — Predictor');
  form.setTitle('🔮 ORACLE VISION X MATCH PREDICTOR');
  form.setDescription(
    home + ' vs ' + away + '\n\n' +
    'Read the match. Trust your instinct. Lock your prediction before kick-off.\n\n' +
    '🎯 Exact score = 3 points\n' +
    '✅ Correct result = 1 point\n' +
    '❌ Wrong result = 0 points\n\n' +
    'Your first valid prediction is final.'
  );
  form.setCollectEmail(false);
  form.setConfirmationMessage(
    '🔮 YOUR PREDICTION IS LOCKED\n\n' +
    'Your call is now inside the Oracle Vision X engine.\n\n' +
    'Return after full-time to see:\n' +
    '🏆 Your points\n' +
    '📊 The leaderboard\n' +
    '🔥 The next match\n\n' +
    'Good luck.'
  );

  // SECTION 2 — Player identity
  form.addPageBreakItem()
      .setTitle('👤 ENTER THE LEAGUE');
  form.addTextItem().setTitle(Q_NAME).setRequired(true);
  form.addTextItem()
      .setTitle(Q_UNIQUE)
      .setHelpText('Use the same Facebook name, username, nickname or other ' +
                   'unique ID every time so your points stay with you.')
      .setRequired(true);

  // SECTION 3 — Match prediction
  form.addPageBreakItem().setTitle('⚽ WHAT IS YOUR CALL?');
  var choices = ['0', '1', '2', '3', '4', '5', '6+'];
  form.addListItem()
      .setTitle('How many goals will ' + home + ' score?')
      .setChoiceValues(choices)
      .setRequired(true);
  form.addListItem()
      .setTitle('How many goals will ' + away + ' score?')
      .setChoiceValues(choices)
      .setRequired(true);

  // SECTION 4 — Match feel (engagement only)
  form.addPageBreakItem().setTitle('🔥 ONE MORE CALL');
  form.addMultipleChoiceItem()
      .setTitle(Q_FIRST_SCORER)
      .setChoiceValues([home, away, 'No goal'])
      .setRequired(false);
  form.addScaleItem()
      .setTitle(Q_CONFIDENCE)
      .setBounds(1, 5)
      .setLabels('Pure guess', 'I see it clearly')
      .setRequired(false);

  // SECTION 5 — Final lock
  form.addPageBreakItem()
      .setTitle('🔒 LOCK IT IN')
      .setHelpText('Your first valid prediction is the one that counts. ' +
                   'Check your call before submitting.');

  return form;
}

/** Read the active match's home/away team names from the Matches sheet. */
function readActiveTeams_(ss) {
  var matches = ss.getSheetByName(SHEET_MATCHES);
  var activeId = '';
  var control = ss.getSheetByName(SHEET_CONTROL);
  if (control) {
    var cdata = control.getDataRange().getValues();
    for (var i = 0; i < cdata.length; i++) {
      if (String(cdata[i][0]).trim() === 'Active Match ID') {
        activeId = String(cdata[i][1]).trim();
      }
    }
  }
  var data = matches.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var id = String(data[r][M_MATCH_ID - 1]).trim();
    if ((activeId && id === activeId) || (!activeId && r === 1)) {
      return { id: id, home: data[r][M_HOME - 1], away: data[r][M_AWAY - 1] };
    }
  }
  // Fallback to seed defaults.
  return { id: DEFAULT_MATCH_ID, home: 'Blue Team', away: 'Red Team' };
}

/**
 * Public: rebuild the creative Form for the current active match without
 * rebuilding the whole engine. Replaces the stored Form and its trigger.
 */
function rebuildCreativeForm() {
  var ss = openSpreadsheet_();

  // Remove old form-submit triggers, then delete old form.
  removeTriggersFor_('handleOracleFormSubmit');
  var oldId = getProp_(PROP_FORM_ID);

  var form = buildFormForActiveMatch_(ss);
  setProp_(PROP_FORM_ID, form.getId());

  ScriptApp.newTrigger('handleOracleFormSubmit')
           .forForm(form)
           .onFormSubmit()
           .create();

  controlSet_('Form ID', form.getId());
  controlSet_('Public Form URL', form.getPublishedUrl());
  controlSet_('Edit Form URL', form.getEditUrl());

  // Best-effort: trash the old form file so it stops collecting responses.
  if (oldId && oldId !== form.getId()) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {}
  }

  Logger.log('New Public Form URL: ' + form.getPublishedUrl());
  return form.getPublishedUrl();
}

/* ===========================================================================
 * SECTION L — TRIGGERS
 * =========================================================================== */

function installTriggers_(ss, form) {
  removeTriggersFor_('handleOracleFormSubmit');
  removeTriggersFor_('handleOracleMatchEdit');

  ScriptApp.newTrigger('handleOracleFormSubmit')
           .forForm(form)
           .onFormSubmit()
           .create();

  ScriptApp.newTrigger('handleOracleMatchEdit')
           .forSpreadsheet(ss)
           .onEdit()
           .create();
}

function removeTriggersFor_(handlerName) {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/* ===========================================================================
 * SECTION M — DIAGNOSTICS & REPAIR
 * =========================================================================== */

/** Return (and log) a clear diagnostic report of the whole system. */
function runLiveSystemCheck() {
  var report = [];
  function add(label, ok, detail) {
    report.push((ok ? '✅' : '❌') + ' ' + label +
                (detail ? ' — ' + detail : ''));
  }

  var spreadsheetId = getProp_(PROP_SPREADSHEET_ID);
  add('Script Property: Spreadsheet ID', !!spreadsheetId, spreadsheetId || 'MISSING');

  var ss = null;
  if (spreadsheetId) {
    try { ss = SpreadsheetApp.openById(spreadsheetId); add('Spreadsheet opens', true); }
    catch (e) { add('Spreadsheet opens', false, e.message); }
  }

  var formId = getProp_(PROP_FORM_ID);
  add('Script Property: Form ID', !!formId, formId || 'MISSING');
  if (formId) {
    try { FormApp.openById(formId); add('Form opens', true); }
    catch (e) { add('Form opens', false, e.message); }
  }

  if (ss) {
    add('Control sheet exists', !!ss.getSheetByName(SHEET_CONTROL));
    add('Matches sheet exists', !!ss.getSheetByName(SHEET_MATCHES));
    add('Entries sheet exists', !!ss.getSheetByName(SHEET_ENTRIES));
    add('Leaderboard sheet exists', !!ss.getSheetByName(SHEET_LEADERBOARD));

    try {
      var active = getActiveMatch_();
      add('Active match exists', !!active.match,
          active.id + (active.match ? '' : ' (not found)'));
    } catch (e) {
      add('Active match exists', false, e.message);
    }
  }

  var handlers = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    handlers[t.getHandlerFunction()] = true;
  });
  add('Form-submit trigger installed', !!handlers['handleOracleFormSubmit']);
  add('Match-edit trigger installed', !!handlers['handleOracleMatchEdit']);

  var text = report.join('\n');
  Logger.log(text);
  return text;
}

/**
 * Repair a system created by THIS architecture. Never uses a hardcoded ID —
 * reads IDs from Script Properties, re-creates any missing sheets/headers and
 * reinstalls both triggers.
 */
function repairExistingSystem() {
  var ss = openSpreadsheet_();      // throws clear error if id missing
  var form = openForm_();           // throws clear error if id missing

  // Ensure all sheets + headers exist (without wiping existing data).
  ensureHeaders_(ss);

  // Reinstall triggers cleanly.
  installTriggers_(ss, form);

  // Make sure Control reflects current IDs/URLs.
  controlSet_('Spreadsheet ID', ss.getId());
  controlSet_('Spreadsheet URL', ss.getUrl());
  controlSet_('Form ID', form.getId());
  controlSet_('Public Form URL', form.getPublishedUrl());
  controlSet_('Edit Form URL', form.getEditUrl());

  refreshEverything();
  Logger.log('Repair complete.');
  return 'Repair complete for ' + ss.getUrl();
}

/** Create any missing sheets and (re)write header rows without losing data. */
function ensureHeaders_(ss) {
  var control = ensureSheet_(ss, SHEET_CONTROL);
  if (String(control.getRange(1, 1).getValue()).trim() !== 'Field') {
    control.getRange(1, 1, 1, 2).setValues([['Field', 'Value']]).setFontWeight('bold');
  }

  var matches = ensureSheet_(ss, SHEET_MATCHES);
  matches.getRange(1, 1, 1, 7).setValues([[
    'Match ID', 'Home Team', 'Away Team', 'Entry Close',
    'Actual Home', 'Actual Away', 'Status'
  ]]).setFontWeight('bold');
  if (matches.getLastRow() < 2) {
    matches.getRange(2, 1, 1, 7).setValues([[
      DEFAULT_MATCH_ID, 'Blue Team', 'Red Team', '', '', '', STATUS_OPEN
    ]]);
  }

  var entries = ensureSheet_(ss, SHEET_ENTRIES);
  entries.getRange(1, 1, 1, 10).setValues([[
    'Timestamp', 'Participant Name', 'Unique ID', 'Match ID',
    'Home Prediction', 'Away Prediction', 'First Scorer', 'Confidence',
    'Eligibility', 'Points'
  ]]).setFontWeight('bold');

  var lb = ensureSheet_(ss, SHEET_LEADERBOARD);
  lb.getRange(1, 1, 1, 6).setValues([[
    'Rank', 'Participant Name', 'Total Points', 'Exact Scores',
    'Correct Results', 'Entries'
  ]]).setFontWeight('bold');
}

/* ===========================================================================
 * SECTION N — NODE EXPORT (ignored by Apps Script; enables local unit tests)
 * =========================================================================== */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeParticipantId: normalizeParticipantId,
    parseScore: parseScore,
    resultCategory: resultCategory,
    calculatePoints: calculatePoints,
    findOfficialSubmissions: findOfficialSubmissions,
    aggregateLeaderboard: aggregateLeaderboard,
    sortLeaderboard: sortLeaderboard,
    computeEngineState: computeEngineState,
    toMillis: toMillis,
    ELIG_WAITING: ELIG_WAITING,
    ELIG_ELIGIBLE: ELIG_ELIGIBLE,
    ELIG_DUPLICATE: ELIG_DUPLICATE,
    ELIG_INVALID: ELIG_INVALID,
    ELIG_CLOSED: ELIG_CLOSED
  };
}
