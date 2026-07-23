'use strict';

const $ = selector => document.querySelector(selector);
const source = $('#source');
const lines = $('#lines');
const RECOVERY_KEY = 'zxSpectrumStudioBasicRecoveryV1';
const TOKENS = [
  'RND','INKEY$','PI','FN','POINT','SCREEN$','ATTR','AT','TAB','VAL$','CODE',
  'VAL','LEN','SIN','COS','TAN','ASN','ACS','ATN','LN','EXP','INT','SQR',
  'SGN','ABS','PEEK','IN','USR','STR$','CHR$','NOT','BIN','OR','AND','<=',
  '>=','<>','LINE','THEN','TO','STEP','DEF FN','CAT','FORMAT','MOVE','ERASE',
  'OPEN #','CLOSE #','MERGE','VERIFY','BEEP','CIRCLE','INK','PAPER','FLASH',
  'BRIGHT','INVERSE','OVER','OUT','LPRINT','LLIST','STOP','READ','DATA',
  'RESTORE','NEW','BORDER','CONTINUE','DIM','REM','FOR','GO TO','GO SUB',
  'INPUT','LOAD','LIST','LET','PAUSE','NEXT','POKE','PRINT','PLOT','RUN',
  'SAVE','RANDOMIZE','IF','CLS','DRAW','CLEAR','RETURN','COPY'
];
const TOKEN_ENTRIES = TOKENS.map((keyword, index) => ({
  keyword,
  compact: keyword.replace(/\s+/g, ''),
  byte: 0xA5 + index
})).sort((a, b) => b.compact.length - a.compact.length);
const STATEMENTS = new Set([
  'BEEP','BORDER','BRIGHT','CIRCLE','CLEAR','CLS','CONTINUE','COPY','DATA',
  'DEF FN','DIM','DRAW','FOR','GO SUB','GO TO','IF','INK','INPUT','INVERSE',
  'LET','LINE','LIST','LLIST','LOAD','LPRINT','NEW','NEXT','OUT','OVER',
  'PAPER','PAUSE','PLOT','POKE','PRINT','RANDOMIZE','READ','REM','RESTORE',
  'RETURN','RUN','SAVE','STOP','VERIFY'
]);
const HELP = {
  'Line numbers': 'Every stored program line needs a whole-number label from 1 to 9999. Leave gaps such as 10, 20, 30 so new lines can be inserted later.',
  'PRINT': 'Display text or values: 10 PRINT "HELLO"; AT 10,8; "SPECTRUM". A semicolon keeps output on the same line.',
  'LET': 'Assign a number or string: 20 LET score=0 or 30 LET name$="KEILAN". LET is required in Sinclair BASIC.',
  'IF / THEN': 'Make a decision: 40 IF lives=0 THEN GO TO 500. Spectrum BASIC has THEN but no ELSE.',
  'FOR / NEXT': 'Repeat a block: 50 FOR n=1 TO 10: PRINT n: NEXT n. STEP changes the increment.',
  'GO TO / GO SUB': 'GO TO jumps to another line. GO SUB calls a subroutine which returns with RETURN. GOTO and GOSUB are accepted by this editor too.',
  'READ / DATA / RESTORE': 'Store constants in DATA, retrieve them in order with READ, and use RESTORE to rewind or select a DATA line.',
  'INPUT / INKEY$': 'INPUT waits for an answer. INKEY$ reads the keyboard without waiting and is useful in games and menus.',
  'PLOT / DRAW / CIRCLE': 'PLOT x,y places a pixel; DRAW dx,dy draws relative to it; CIRCLE x,y,r draws a circle.',
  'INK / PAPER / BRIGHT': 'Spectrum attributes apply to 8×8 character cells. INK is foreground, PAPER background, and BRIGHT selects the brighter palette.',
  'POKE / PEEK': 'PEEK reads a memory byte and POKE writes one. Use them carefully: the Spectrum will faithfully let you poke something important!',
  'USR': 'RANDOMIZE USR address calls machine code. USR "A" gives the address of UDG A.',
  'UDGs': 'On a Spectrum, enter Graphics mode and press A–U to type a UDG. In this editor, write \\A through \\U inside a string; TAP export converts them to the real Spectrum UDG character bytes 144–164.',
  'REM': 'Everything after REM is a comment. Keywords and numbers inside it are stored as ordinary characters.',
  'TAP export': 'The exported TAP contains the real tokenised BASIC program. Set Autostart line to the line that should run automatically after loading.',
  'BAS files': 'Download BAS saves the numbered listing as readable text. To protect work already in the editor, a plain-text BAS file can be imported only after you choose Clear and leave the editor empty.',
  'Renumber': 'Renumber the whole program or an inclusive range. Nothing changes if proposed lines collide with untouched lines or exceed 9999. Literal GO TO, GO SUB, RESTORE, RUN and LIST targets follow moved lines.',
  'Variable Explorer': 'Shows numeric, string, array and FOR/NEXT variables while you type. Rename changes exact code references but leaves strings and REM comments alone. String, array and loop-control names follow the Spectrum’s one-letter rules.',
  '48K compatibility': 'This first editor targets classic 48K Sinclair BASIC. 128 BASIC adds SPECTRUM and PLAY and reduces the normally available UDG letters.'
};
const example = `10 BORDER 1: PAPER 0: INK 7: CLS
20 LET score=0
30 PRINT AT 2,7;"ZX SPECTRUM STUDIO"
40 FOR n=1 TO 10
50 LET score=score+n
60 PRINT AT 6,10;"SCORE ";score
70 NEXT n
80 PRINT AT 10,4;"PRESS ANY KEY TO FINISH"
90 IF INKEY$="" THEN GO TO 90
100 PRINT AT 12,9;"CHEERIO!"
110 STOP
`;

let lastResult = null;
let projectDirty = false;
let sourceUndo = [];
let sourceRedo = [];
let lastSource = '';
let recoveryTimer = null;
let cloudConfig = null;
let cloudUser = null;
let cloudProjects = [];
let currentCloudId = null;
let sharedProject = null;
let googlePromise = null;

function updateLines() {
  const count = source.value.split('\n').length;
  lines.textContent = Array.from({length: count}, (_, index) => index + 1).join('\n');
  lines.scrollTop = source.scrollTop;
  renderVariables();
}

function updateUndoButtons() {
  $('#undoBtn').disabled = sourceUndo.length === 0;
  $('#redoBtn').disabled = sourceRedo.length === 0;
}

function projectData() {
  return {
    format: 'zx-spectrum-basic-editor-project',
    version: 1,
    projectName: $('#projectName').value.trim() || 'My BASIC Program',
    source: source.value,
    tapName: $('#tapName').value,
    autostartLine: $('#autostartLine').value,
    savedAt: new Date().toISOString()
  };
}

function saveRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify({
        project: projectData(),
        dirty: projectDirty
      }));
    } catch (error) {}
  }, 80);
}

function setDirty(value = true) {
  projectDirty = value;
  saveRecovery();
}

function setSource(value, track = true) {
  if (value === source.value) return;
  if (track) sourceUndo.push(source.value);
  sourceUndo = sourceUndo.slice(-100);
  sourceRedo = [];
  source.value = value;
  lastSource = value;
  updateLines();
  updateUndoButtons();
  setDirty();
  validateProgram();
}

function loadProjectData(project, dirty = false) {
  if (
    !project ||
    project.format !== 'zx-spectrum-basic-editor-project' ||
    typeof project.source !== 'string'
  ) {
    throw Error('This is not a ZX Spectrum BASIC project.');
  }
  $('#projectName').value = String(project.projectName || 'My BASIC Program').slice(0, 80);
  source.value = project.source;
  $('#tapName').value = String(project.tapName || 'BASIC').slice(0, 10);
  $('#autostartLine').value = String(project.autostartLine || '10').slice(0, 4);
  lastSource = source.value;
  sourceUndo = [];
  sourceRedo = [];
  updateLines();
  updateUndoButtons();
  projectDirty = dirty;
  saveRecovery();
  validateProgram();
}

function restoreRecovery() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECOVERY_KEY));
    if (saved && saved.project) {
      loadProjectData(saved.project, saved.dirty === true);
      return;
    }
  } catch (error) {}
  source.value = example;
  lastSource = source.value;
}

function spectrumNumber(value) {
  if (!Number.isFinite(value)) throw Error('Number is outside the Spectrum range.');
  if (Number.isInteger(value) && value >= 0 && value <= 65535) {
    return [0, 0, value & 255, value >> 8, 0];
  }
  if (value === 0) return [0, 0, 0, 0, 0];
  const negative = value < 0;
  const absolute = Math.abs(value);
  const power = Math.floor(Math.log2(absolute));
  const exponent = power + 0x81;
  if (exponent <= 0 || exponent >= 256) throw Error('Number is outside the Spectrum range.');
  const fraction = absolute / Math.pow(2, power) - 1;
  let mantissa = Math.round(fraction * 0x80000000);
  if (mantissa >= 0x80000000) mantissa = 0x7FFFFFFF;
  return [
    exponent,
    ((mantissa >>> 24) & 0x7F) | (negative ? 0x80 : 0),
    (mantissa >>> 16) & 255,
    (mantissa >>> 8) & 255,
    mantissa & 255
  ];
}

function spectrumChar(character) {
  const code = character.charCodeAt(0);
  if (character === '£') return 0x60;
  if (code >= 32 && code <= 126) return code;
  throw Error('Character "' + character + '" is not available in the 48K Spectrum character set.');
}

function isWordCharacter(character) {
  return Boolean(character && /[A-Z0-9_$]/i.test(character));
}

function matchToken(text, offset) {
  const remaining = text.slice(offset).toUpperCase();
  for (const entry of TOKEN_ENTRIES) {
    const expression = entry.compact
      .split('')
      .map(character => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    const match = remaining.match(new RegExp('^' + expression));
    if (!match) continue;
    const before = text[offset - 1] || '';
    const after = text[offset + match[0].length] || '';
    const first = entry.compact[0];
    const last = entry.compact[entry.compact.length - 1];
    if (isWordCharacter(first) && isWordCharacter(before)) continue;
    if (isWordCharacter(last) && isWordCharacter(after)) continue;
    return {...entry, length: match[0].length};
  }
  return null;
}

function tokeniseBody(body) {
  const bytes = [];
  const keywords = [];
  let offset = 0;
  let quoted = false;
  let remark = false;

  while (offset < body.length) {
    const character = body[offset];
    if (character === '"') {
      quoted = !quoted;
      bytes.push(34);
      offset++;
      continue;
    }
    if (remark) {
      bytes.push(spectrumChar(character));
      offset++;
      continue;
    }
    if (
      character === '\\' &&
      /^[A-U]$/i.test(body[offset + 1] || '')
    ) {
      bytes.push(0x90 + body[offset + 1].toUpperCase().charCodeAt(0) - 65);
      offset += 2;
      continue;
    }
    if (!quoted) {
      const token = matchToken(body, offset);
      if (token) {
        if (bytes[bytes.length - 1] === 0x20) bytes.pop();
        bytes.push(token.byte);
        keywords.push(token.keyword);
        offset += token.length;
        if (token.keyword === 'REM') remark = true;
        if (body[offset] === ' ') offset++;
        continue;
      }
      const numberMatch = body.slice(offset).match(
        /^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/
      );
      const previous = body[offset - 1] || '';
      if (numberMatch && !/[A-Z_$]/i.test(previous)) {
        const text = numberMatch[0];
        for (const digit of text) bytes.push(spectrumChar(digit));
        bytes.push(0x0E, ...spectrumNumber(Number(text)));
        offset += text.length;
        continue;
      }
    }
    bytes.push(spectrumChar(character));
    offset++;
  }
  return {bytes, keywords, quoted};
}

function parseProgram(text) {
  const errors = [];
  const warnings = [];
  const programLines = [];
  const seen = new Set();
  const physicalLines = text.replace(/\r/g, '').split('\n');

  physicalLines.forEach((raw, index) => {
    if (!raw.trim()) return;
    const match = raw.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) {
      errors.push({line: index + 1, message: 'A program line must begin with a line number.'});
      return;
    }
    const number = Number(match[1]);
    const body = match[2].replace(/\s+$/, '');
    if (!Number.isInteger(number) || number < 1 || number > 9999) {
      errors.push({line: index + 1, message: 'Line number must be between 1 and 9999.'});
      return;
    }
    if (seen.has(number)) {
      errors.push({line: index + 1, message: 'Duplicate BASIC line number ' + number + '.'});
      return;
    }
    seen.add(number);
    if (!body) errors.push({line: index + 1, message: 'Line ' + number + ' has no statement.'});
    if ((body.match(/"/g) || []).length % 2) {
      errors.push({line: index + 1, message: 'Line ' + number + ' has an unclosed string.'});
    }
    let depth = 0;
    let quoted = false;
    for (const character of body) {
      if (character === '"') quoted = !quoted;
      if (!quoted && character === '(') depth++;
      if (!quoted && character === ')') depth--;
      if (depth < 0) break;
    }
    if (depth !== 0) warnings.push({line: index + 1, message: 'Check the brackets on line ' + number + '.'});
    if (/\bIF\b/i.test(body) && !/\bTHEN\b/i.test(body)) {
      errors.push({line: index + 1, message: 'IF on line ' + number + ' needs THEN.'});
    }
    try {
      const tokenised = tokeniseBody(body);
      const statementKeywords = tokenised.keywords.filter(keyword => STATEMENTS.has(keyword));
      if (!statementKeywords.length) {
        warnings.push({line: index + 1, message: 'No recognised Spectrum BASIC statement was found on line ' + number + '.'});
      }
      programLines.push({
        physicalLine: index + 1,
        number,
        body,
        bytes: tokenised.bytes,
        keywords: tokenised.keywords
      });
    } catch (error) {
      errors.push({line: index + 1, message: error.message});
    }
  });

  programLines.sort((a, b) => a.number - b.number);
  const available = new Set(programLines.map(line => line.number));
  for (const line of programLines) {
    const targetPattern = /\b(?:GO\s*TO|GO\s*SUB|RESTORE)\s+(\d+)/gi;
    let target;
    while ((target = targetPattern.exec(line.body))) {
      if (!available.has(Number(target[1]))) {
        warnings.push({
          line: line.physicalLine,
          message: 'Line ' + line.number + ' refers to missing line ' + target[1] + '.'
        });
      }
    }
  }
  collectVariables(text).forEach(variable => {
    const physicalLine = variable.occurrences[0]?.line || 1;
    if (variable.kind === 'string' && !/^[A-Za-z]\$$/.test(variable.name)) {
      errors.push({
        line: physicalLine,
        message: 'Spectrum string variable ' + variable.name + ' must be one letter followed by $.'
      });
    } else if (variable.array && !/^[A-Za-z](?:\$)?$/.test(variable.name)) {
      errors.push({
        line: physicalLine,
        message: 'Spectrum array name ' + variable.name + ' must use one letter' +
          (variable.kind === 'string' ? ' followed by $.' : '.')
      });
    } else if (variable.loop && !/^[A-Za-z]$/.test(variable.name)) {
      errors.push({
        line: physicalLine,
        message: 'FOR/NEXT control variable ' + variable.name + ' must be one numeric letter.'
      });
    }
  });
  if (!programLines.length) errors.push({line: 1, message: 'The program is empty.'});
  return {errors, warnings, lines: programLines};
}

function codeMask(body) {
  const characters = [...body];
  let quoted = false;
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '"') {
      quoted = !quoted;
      characters[index] = ' ';
      continue;
    }
    if (quoted) {
      characters[index] = ' ';
      continue;
    }
    if (
      body.slice(index, index + 3).toUpperCase() === 'REM' &&
      !isWordCharacter(body[index - 1]) &&
      !isWordCharacter(body[index + 3])
    ) {
      for (let rest = index; rest < characters.length; rest++) characters[rest] = ' ';
      break;
    }
  }
  return characters.join('');
}

function sourceRecords(text) {
  const records = [];
  const seen = new Set();
  const rows = text.replace(/\r/g, '').split('\n');
  rows.forEach((raw, physicalIndex) => {
    if (!raw.trim()) return;
    const match = raw.match(/^(\s*)(\d+)(\s+)(.*)$/);
    if (!match) {
      throw Error('Physical line ' + (physicalIndex + 1) + ' does not begin with a valid BASIC line number.');
    }
    const number = Number(match[2]);
    if (!Number.isInteger(number) || number < 1 || number > 9999) {
      throw Error('Line numbers must be whole numbers from 1 to 9999.');
    }
    if (seen.has(number)) {
      throw Error('The program already contains duplicate line number ' + number + '. Resolve duplicates before renumbering.');
    }
    seen.add(number);
    records.push({
      raw,
      physicalIndex,
      number,
      leading: match[1],
      separator: match[3],
      body: match[4]
    });
  });
  return {rows, records};
}

function replaceLineTargets(body, mapping) {
  const mask = codeMask(body);
  const pattern = /\b(?:GO\s*TO|GOTO|GO\s*SUB|GOSUB|RESTORE|RUN|LIST)\s+(\d+)\b(?=\s*(?::|$))/gi;
  const replacements = [];
  let match;
  while ((match = pattern.exec(mask))) {
    const oldTarget = Number(match[1]);
    if (!mapping.has(oldTarget)) continue;
    const relative = match[0].lastIndexOf(match[1]);
    replacements.push({
      start: match.index + relative,
      end: match.index + relative + match[1].length,
      value: String(mapping.get(oldTarget))
    });
  }
  let output = body;
  replacements.reverse().forEach(change => {
    output = output.slice(0, change.start) + change.value + output.slice(change.end);
  });
  return {body: output, changed: replacements.length};
}

function renumberedSource(text, options) {
    const {rows, records} = sourceRecords(text);
    if (!records.length) throw Error('There are no program lines to renumber.');
    const {scope, first, increment} = options;
    if (!Number.isInteger(first) || first < 1 || first > 9999) {
      throw Error('First new line must be a whole number from 1 to 9999.');
    }
    if (!Number.isInteger(increment) || increment < 1 || increment > 9999) {
      throw Error('Increment must be a positive whole number.');
    }
    let from = 1;
    let through = 9999;
    if (scope === 'range') {
      from = options.from;
      through = options.through;
      if (
        !Number.isInteger(from) ||
        !Number.isInteger(through) ||
        from < 1 ||
        through > 9999 ||
        from > through
      ) {
        throw Error('The existing line range must use whole numbers from 1 to 9999, with From no higher than Through.');
      }
    }
    const selected = records
      .filter(record => record.number >= from && record.number <= through)
      .sort((a, b) => a.number - b.number);
    if (!selected.length) throw Error('No program lines fall inside the selected range.');
    const selectedNumbers = new Set(selected.map(record => record.number));
    const untouchedNumbers = new Set(
      records.filter(record => !selectedNumbers.has(record.number)).map(record => record.number)
    );
    const mapping = new Map();
    selected.forEach((record, index) => {
      const proposed = first + index * increment;
      if (proposed > 9999) {
        throw Error('Renumbering would create line ' + proposed + ', beyond the Spectrum limit of 9999.');
      }
      if (untouchedNumbers.has(proposed)) {
        throw Error(
          'Renumbering collision: proposed line ' + proposed +
          ' is already used by an untouched line. Choose a different first line, increment, or range.'
        );
      }
      mapping.set(record.number, proposed);
    });
    let referenceChanges = 0;
    records.forEach(record => {
      const references = replaceLineTargets(record.body, mapping);
      referenceChanges += references.changed;
      const number = mapping.get(record.number) ?? record.number;
      rows[record.physicalIndex] =
        record.leading + number + record.separator + references.body;
    });
    return {
      source: rows.join('\n'),
      linesChanged: selected.length,
      referenceChanges
    };
}

function renumberProgram() {
  const message = $('#renumberMessage');
  message.className = 'tool-message';
  try {
    const result = renumberedSource(source.value, {
      scope: $('#renumberScope').value,
      first: Number($('#renumberFirst').value),
      increment: Number($('#renumberStep').value),
      from: Number($('#renumberFrom').value),
      through: Number($('#renumberTo').value)
    });
    setSource(result.source);
    message.textContent =
      'Renumbered ' + result.linesChanged + ' line' + (result.linesChanged === 1 ? '' : 's') +
      ' and updated ' + result.referenceChanges + ' literal line reference' +
      (result.referenceChanges === 1 ? '' : 's') + '.';
    message.classList.add('ok');
  } catch (error) {
    message.textContent = 'Renumbering cancelled: ' + error.message;
    message.classList.add('error');
  }
}

const KEYWORD_PARTS = new Set(
  TOKENS.flatMap(keyword => [
    ...keyword.replace(/[^A-Z$ ]/g, ' ').split(/\s+/),
    keyword.replace(/[^A-Z$]/g, '')
  ]).filter(Boolean)
);

function collectVariables(text) {
  const variables = new Map();
  const rows = text.replace(/\r/g, '').split('\n');
  const rowInfo = rows.map(raw => {
    const lineMatch = raw.match(/^\s*\d+\s+(.*)$/);
    if (!lineMatch) return null;
    const body = lineMatch[1];
    return {body, bodyStart: raw.length - body.length, mask: codeMask(body)};
  });
  const loopNames = new Set();
  const dimNames = new Set();
  rowInfo.forEach(info => {
    if (!info) return;
    let match;
    const loopPattern = /\b(?:FOR|NEXT)\s+([A-Za-z][A-Za-z0-9]*)/gi;
    while ((match = loopPattern.exec(info.mask))) loopNames.add(match[1].toLowerCase());
    const dimPattern = /\bDIM\s+([A-Za-z](?:\$)?)\s*\(/gi;
    while ((match = dimPattern.exec(info.mask))) dimNames.add(match[1].toLowerCase());
  });
  let sourceOffset = 0;
  rows.forEach((raw, physicalIndex) => {
    const info = rowInfo[physicalIndex];
    if (!info) {
      sourceOffset += raw.length + 1;
      return;
    }
    const {bodyStart, mask} = info;
    const identifierPattern = /[A-Za-z][A-Za-z0-9]*\$?/g;
    let match;
    while ((match = identifierPattern.exec(mask))) {
      const name = match[0];
      const upper = name.toUpperCase();
      const before = mask[match.index - 1] || '';
      if (/[A-Za-z0-9_$\\]/.test(before) || KEYWORD_PARTS.has(upper)) continue;
      const prefix = mask.slice(0, match.index);
      if (/\b(?:DEF\s+)?FN\s*$/i.test(prefix)) continue;
      let nextIndex = match.index + name.length;
      while (mask[nextIndex] === ' ') nextIndex++;
      const string = name.endsWith('$');
      const array = string
        ? dimNames.has(name.toLowerCase())
        : mask[nextIndex] === '(';
      const loop = !string && loopNames.has(name.toLowerCase());
      const kind = string ? 'string' : 'number';
      const key = kind + ':' + (array ? 'array:' : 'scalar:') + name.toLowerCase();
      if (!variables.has(key)) {
        variables.set(key, {
          key,
          name,
          normalized: name.toLowerCase(),
          kind,
          array,
          loop,
          occurrences: []
        });
      }
      const variable = variables.get(key);
      variable.loop = variable.loop || loop;
      variable.occurrences.push({
        start: sourceOffset + bodyStart + match.index,
        end: sourceOffset + bodyStart + match.index + name.length,
        line: physicalIndex + 1
      });
    }
    sourceOffset += raw.length + 1;
  });
  return [...variables.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}) ||
    Number(a.array) - Number(b.array)
  );
}

function variableDescription(variable) {
  if (variable.array) return variable.kind === 'string' ? 'String array' : 'Numeric array';
  if (variable.loop) return 'Numeric · FOR/NEXT control';
  return variable.kind === 'string' ? 'String' : 'Numeric';
}

function validVariableRename(variable, newName, variables) {
  if (variable.kind === 'string') {
    if (!/^[A-Za-z]\$$/.test(newName)) {
      throw Error('String variables must be one letter followed by $.');
    }
  } else if (variable.array || variable.loop) {
    if (!/^[A-Za-z]$/.test(newName)) {
      throw Error((variable.array ? 'Array names' : 'FOR/NEXT control variables') + ' must be one letter.');
    }
  } else if (!/^[A-Za-z][A-Za-z0-9]*$/.test(newName)) {
    throw Error('Numeric variable names must begin with a letter and contain only letters and digits.');
  }
  const normalized = newName.toLowerCase();
  const conflict = variables.find(other =>
    other.key !== variable.key && other.normalized === normalized
  );
  if (conflict) {
    throw Error('The name ' + newName + ' is already used by ' + variableDescription(conflict).toLowerCase() + ' variable ' + conflict.name + '.');
  }
}

function renameVariable(variable, newName) {
  const message = $('#variableMessage');
  message.className = 'tool-message';
  try {
    const variables = collectVariables(source.value);
    const current = variables.find(item => item.key === variable.key);
    if (!current) throw Error('That variable is no longer present.');
    const cleaned = newName.trim();
    if (cleaned.toLowerCase() === current.name.toLowerCase()) {
      throw Error('Enter a different variable name.');
    }
    validVariableRename(current, cleaned, variables);
    let output = source.value;
    [...current.occurrences].reverse().forEach(occurrence => {
      output = output.slice(0, occurrence.start) + cleaned + output.slice(occurrence.end);
    });
    setSource(output);
    message.textContent =
      'Renamed ' + current.name + ' to ' + cleaned + ' in ' +
      current.occurrences.length + ' place' + (current.occurrences.length === 1 ? '' : 's') + '.';
    message.classList.add('ok');
  } catch (error) {
    message.textContent = 'Rename cancelled: ' + error.message;
    message.classList.add('error');
  }
}

function renderVariables() {
  const list = $('#variableList');
  if (!list) return;
  const variables = collectVariables(source.value);
  list.replaceChildren();
  if (!variables.length) {
    const empty = document.createElement('p');
    empty.className = 'mini';
    empty.textContent = 'No variables found yet.';
    list.appendChild(empty);
    return;
  }
  variables.forEach(variable => {
    const row = document.createElement('div');
    row.className = 'variable-row';
    const current = document.createElement('div');
    current.className = 'variable-current';
    current.textContent = variable.name;
    const kind = document.createElement('span');
    kind.className = 'variable-kind';
    kind.textContent =
      variableDescription(variable) + ' · ' + variable.occurrences.length +
      ' use' + (variable.occurrences.length === 1 ? '' : 's');
    current.appendChild(kind);
    const label = document.createElement('label');
    label.textContent = 'New name';
    const input = document.createElement('input');
    input.value = variable.name;
    input.setAttribute('aria-label', 'New name for ' + variable.name);
    label.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = 'Rename';
    button.onclick = () => renameVariable(variable, input.value);
    input.onkeydown = event => {
      if (event.key === 'Enter') button.click();
    };
    row.append(current, label, button);
    list.appendChild(row);
  });
}

function buildProgramBytes(result) {
  const output = [];
  for (const line of result.lines) {
    const contents = [...line.bytes, 0x0D];
    output.push(
      (line.number >> 8) & 255,
      line.number & 255,
      contents.length & 255,
      contents.length >> 8,
      ...contents
    );
  }
  return output;
}

function gotoPhysicalLine(number) {
  const rows = source.value.split('\n');
  let position = 0;
  for (let index = 1; index < number; index++) position += rows[index - 1].length + 1;
  source.focus();
  source.setSelectionRange(position, position + (rows[number - 1] || '').length);
}

function renderProblems(result) {
  const container = $('#problems');
  const problems = [
    ...result.errors.map(problem => ({...problem, kind: 'error'})),
    ...result.warnings.map(problem => ({...problem, kind: 'warn'}))
  ];
  if (!problems.length) {
    container.innerHTML = '<div class="okbox">The program passed the Studio checks.</div>';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'errors';
  for (const problem of problems) {
    const item = document.createElement('li');
    if (problem.kind === 'warn') item.className = 'warn';
    item.textContent = (problem.kind === 'warn' ? 'Warning: ' : 'Error: ') + problem.message;
    item.onclick = () => gotoPhysicalLine(problem.line);
    list.appendChild(item);
  }
  container.replaceChildren(list);
}

function validateProgram() {
  const result = parseProgram(source.value);
  result.programBytes = result.errors.length ? [] : buildProgramBytes(result);
  lastResult = result;
  $('#lineStat').textContent = result.lines.length;
  $('#sizeStat').textContent = result.programBytes.length + ' bytes';
  $('#errorStat').textContent = result.errors.length;
  $('#warningStat').textContent = result.warnings.length;
  renderProblems(result);
  $('#tokenisedOut').textContent = result.lines.map(line =>
    String(line.number).padStart(4) + '  ' +
    line.bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
  ).join('\n') || 'No tokenised lines.';
  const counts = new Map();
  result.lines.flatMap(line => line.keywords).forEach(keyword =>
    counts.set(keyword, (counts.get(keyword) || 0) + 1)
  );
  $('#keywordsOut').textContent = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([keyword, count]) => keyword.padEnd(14) + count)
    .join('\n') || 'No recognised keywords.';
  return result;
}

function ensureValid() {
  const result = validateProgram();
  if (result.errors.length) throw Error('Fix the BASIC errors before exporting.');
  return result;
}

function checksum(bytes) {
  return bytes.reduce((value, byte) => value ^ byte, 0) & 255;
}

function tapBlock(flag, data) {
  const payload = [flag, ...data];
  payload.push(checksum(payload));
  return [payload.length & 255, payload.length >> 8, ...payload];
}

function tapHeader(type, name, length, parameter1, parameter2) {
  const clean = (name.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 10) + '          ').slice(0, 10);
  return [
    type,
    ...[...clean].map(character => character.charCodeAt(0)),
    length & 255,
    length >> 8,
    parameter1 & 255,
    parameter1 >> 8,
    parameter2 & 255,
    parameter2 >> 8
  ];
}

function buildTap() {
  const result = ensureValid();
  const program = result.programBytes;
  const requested = Number($('#autostartLine').value);
  const autostart = Number.isInteger(requested) && requested >= 1 && requested <= 9999
    ? requested
    : 0x8000;
  const name = $('#tapName').value.trim() || 'BASIC';
  const bytes = [
    ...tapBlock(0, tapHeader(0, name, program.length, autostart, program.length)),
    ...tapBlock(255, program)
  ];
  return {bytes: new Uint8Array(bytes), name: name + '.tap'};
}

function download(data, name, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([data], {type}));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function downloadTap() {
  try {
    const tap = buildTap();
    download(tap.bytes, tap.name, 'application/octet-stream');
  } catch (error) {
    alert(error.message);
  }
}

function basicFileName() {
  const name = ($('#projectName').value.trim() || $('#tapName').value.trim() || 'basic')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '');
  return (name || 'basic') + '.bas';
}

function downloadBas() {
  const listing = source.value.replace(/\r\n?/g, '\n');
  download(new TextEncoder().encode(listing), basicFileName(), 'text/plain;charset=utf-8');
}

function importBasFile(file) {
  if (!file) return;
  if (source.value.trim() !== '') {
    alert('BAS import is available only when the BASIC editor is empty. Clear the listing first so existing work cannot be overwritten.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const listing = String(reader.result).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      if (listing.includes('\0')) {
        throw Error('This BAS file appears to be binary. This preview imports plain-text, line-numbered BAS listings.');
      }
      setSource(listing);
      const result = validateProgram();
      if (result.errors.length) {
        alert('The BAS listing was imported, but the validator found ' + result.errors.length + ' issue' + (result.errors.length === 1 ? '' : 's') + '.');
      }
    } catch (error) {
      alert(error.message);
    }
  };
  reader.onerror = () => alert('The BAS file could not be read.');
  reader.readAsText(file);
}

function saveProjectFile() {
  const project = projectData();
  const safe = (project.projectName || 'basic').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'basic';
  download(new TextEncoder().encode(JSON.stringify(project, null, 2)), safe + '.json', 'application/json');
  projectDirty = false;
  saveRecovery();
}

function newProject() {
  if (projectDirty && !confirm('Start a new BASIC project and replace your unsaved work?')) return;
  loadProjectData({
    format: 'zx-spectrum-basic-editor-project',
    projectName: 'My BASIC Program',
    source: '10 REM MY SPECTRUM PROGRAM\n20 PRINT "HELLO!"\n',
    tapName: 'BASIC',
    autostartLine: '10'
  }, false);
  currentCloudId = null;
  $('#updateCloud').disabled = true;
}

function loadProjectFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (projectDirty && !confirm('Open this project and replace your unsaved work?')) return;
      loadProjectData(JSON.parse(String(reader.result)), false);
      currentCloudId = null;
      $('#updateCloud').disabled = true;
    } catch (error) {
      alert(error.message);
    }
  };
  reader.readAsText(file);
}

function undoSource() {
  if (!sourceUndo.length) return;
  sourceRedo.push(source.value);
  source.value = sourceUndo.pop();
  lastSource = source.value;
  updateLines();
  updateUndoButtons();
  setDirty();
  validateProgram();
}

function redoSource() {
  if (!sourceRedo.length) return;
  sourceUndo.push(source.value);
  source.value = sourceRedo.pop();
  lastSource = source.value;
  updateLines();
  updateUndoButtons();
  setDirty();
  validateProgram();
}

const cloudOverlay = $('#cloudOverlay');
const cloudStatus = $('#cloudStatus');
const helpOverlay = $('#helpOverlay');
const helpDialogBody = helpOverlay.querySelector('.help-dialog-body');
let helpPreviousFocus = null;

function openHelp() {
  helpPreviousFocus = document.activeElement;
  helpOverlay.hidden = false;
  document.body.classList.add('help-open');
  helpDialogBody.scrollTop = 0;
  $('#closeHelp').focus();
}

function closeHelp() {
  if (helpOverlay.hidden) return;
  helpOverlay.hidden = true;
  document.body.classList.remove('help-open');
  if (helpPreviousFocus instanceof HTMLElement) helpPreviousFocus.focus();
}

function cloudMessage(message, error = false) {
  cloudStatus.textContent = message;
  cloudStatus.classList.toggle('error', error);
}

async function cloudApi(action, options = {}) {
  const query = new URLSearchParams({action, ...(options.query || {})});
  const request = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {Accept: 'application/json'}
  };
  if (options.body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    if (cloudConfig && cloudConfig.csrf) request.headers['X-CSRF-Token'] = cloudConfig.csrf;
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch('../api/index.php?' + query, request);
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw Error('The cloud service returned an unreadable response.');
  }
  if (!response.ok || !data.ok) throw Error(data.error || 'The cloud request failed.');
  return data;
}

function openCloud() {
  cloudOverlay.hidden = false;
  document.body.classList.add('modal-open');
  $('#cloudClose').focus();
}

function closeCloud() {
  cloudOverlay.hidden = true;
  document.body.classList.remove('modal-open');
}

function qaopUrl(tapUrl) {
  return 'https://torinak.com/qaop/#l=' + tapUrl;
}

async function copyLink(url, label) {
  try {
    await navigator.clipboard.writeText(url);
    cloudMessage(label + ' copied');
  } catch (error) {
    prompt('Copy this link:', url);
  }
}

function cloudButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = label;
  button.onclick = handler;
  return button;
}

function cloudLink(label, url) {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

function updateCloudUser() {
  const signedIn = Boolean(cloudUser);
  $('#signedOut').hidden = signedIn;
  $('#signedIn').hidden = !signedIn;
  if (!signedIn) return;
  $('#cloudUserName').textContent = cloudUser.name;
  $('#cloudUserEmail').textContent = cloudUser.email;
  $('#cloudName').value = $('#cloudName').value || $('#projectName').value;
  $('#updateCloud').disabled = !currentCloudId;
}

function renderCloudProjects() {
  const list = $('#cloudList');
  list.replaceChildren();
  const projects = cloudProjects.filter(project => project.type === 'basic');
  if (!projects.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No BASIC projects saved yet.';
    list.appendChild(empty);
    return;
  }
  for (const project of projects) {
    const card = document.createElement('article');
    card.className = 'cloud-card' + (project.id === currentCloudId ? ' current' : '');
    const head = document.createElement('div');
    head.className = 'cloud-card-head';
    const title = document.createElement('h3');
    title.textContent = project.name;
    const state = document.createElement('strong');
    state.textContent = project.published ? 'Published' : 'Private';
    head.append(title, state);
    const meta = document.createElement('div');
    meta.className = 'cloud-meta';
    meta.textContent = 'Updated ' + new Date(project.updatedAt).toLocaleString();
    const actions = document.createElement('div');
    actions.className = 'cloud-actions';
    actions.append(cloudButton('Open', () => loadCloudProject(project.id)));
    if (project.id === currentCloudId) {
      actions.append(cloudButton('Save', () => saveCloudProject(project.id)));
      actions.append(cloudButton(project.published ? 'Update TAP' : 'Publish TAP', () => publishCloud(project.id)));
    }
    if (project.published) {
      actions.append(cloudButton('Copy Project Link', () => copyLink(project.shareUrl, 'Project link')));
      actions.append(cloudButton('Copy TAP Link', () => copyLink(project.tapUrl, 'TAP link')));
      actions.append(cloudLink('Download TAP', project.tapUrl));
      actions.append(cloudLink('Try in QAOP', qaopUrl(project.tapUrl)));
      actions.append(cloudButton('Unpublish', () => unpublishCloud(project.id)));
    }
    actions.append(cloudButton('Delete', () => deleteCloud(project)));
    card.append(head, meta, actions);
    list.appendChild(card);
  }
}

async function refreshCloud() {
  if (!cloudUser) return;
  try {
    const result = await cloudApi('projects');
    cloudProjects = result.projects;
    renderCloudProjects();
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

async function saveCloudProject(id = null, quiet = false) {
  if (!cloudUser) {
    cloudMessage('Sign in before saving.', true);
    return null;
  }
  cloudMessage(id ? 'Updating cloud project…' : 'Saving cloud project…');
  try {
    const result = await cloudApi('save-project', {
      method: 'POST',
      body: {
        id,
        name: $('#cloudName').value.trim() || $('#projectName').value,
        project: projectData()
      }
    });
    currentCloudId = result.project.id;
    $('#projectName').value = result.project.name;
    $('#cloudName').value = result.project.name;
    projectDirty = false;
    saveRecovery();
    $('#updateCloud').disabled = false;
    await refreshCloud();
    if (!quiet) cloudMessage('Cloud project saved');
    return result.project;
  } catch (error) {
    cloudMessage(error.message, true);
    return null;
  }
}

async function loadCloudProject(id) {
  if (projectDirty && !confirm('Open this cloud project and replace your unsaved work?')) return;
  cloudMessage('Opening cloud project…');
  try {
    const result = await cloudApi('load-project', {query: {id}});
    if (result.meta.type !== 'basic') throw Error('This is not a BASIC project.');
    loadProjectData(result.project, false);
    currentCloudId = result.meta.id;
    $('#cloudName').value = result.meta.name;
    $('#updateCloud').disabled = false;
    renderCloudProjects();
    closeCloud();
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

function bytesBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 8192));
  }
  return btoa(binary);
}

async function publishCloud(id) {
  const saved = await saveCloudProject(id, true);
  if (!saved) return;
  cloudMessage('Tokenising and publishing TAP…');
  try {
    const tap = buildTap();
    const result = await cloudApi('publish-project', {
      method: 'POST',
      body: {id, tap: bytesBase64(tap.bytes)}
    });
    await refreshCloud();
    cloudMessage('Published. Project, TAP and QAOP links are ready.');
    await copyLink(result.project.tapUrl, 'TAP link');
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

async function unpublishCloud(id) {
  if (!confirm('Remove the public project and TAP links? The private save will remain.')) return;
  try {
    await cloudApi('unpublish-project', {method: 'POST', body: {id}});
    await refreshCloud();
    cloudMessage('Project is private again');
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

async function deleteCloud(project) {
  if (!confirm('Delete the cloud project "' + project.name + '"?')) return;
  try {
    await cloudApi('delete-project', {method: 'POST', body: {id: project.id}});
    if (currentCloudId === project.id) {
      currentCloudId = null;
      $('#updateCloud').disabled = true;
    }
    await refreshCloud();
    cloudMessage('Cloud project deleted');
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

function googleScript() {
  if (window.google && window.google.accounts) return Promise.resolve();
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(Error('Google sign-in could not be loaded.'));
    document.head.appendChild(script);
  });
  return googlePromise;
}

async function prepareGoogle() {
  if (!cloudConfig || !cloudConfig.googleClientId) return;
  try {
    await googleScript();
    $('#googleButton').replaceChildren();
    google.accounts.id.initialize({
      client_id: cloudConfig.googleClientId,
      callback: googleLogin,
      auto_select: false
    });
    google.accounts.id.renderButton($('#googleButton'), {
      theme: 'outline',
      size: 'large',
      text: 'signin_with'
    });
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

async function googleLogin(response) {
  try {
    const result = await cloudApi('google-login', {
      method: 'POST',
      body: {credential: response.credential}
    });
    cloudUser = result.user;
    updateCloudUser();
    await refreshCloud();
    cloudMessage('Signed in');
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

async function signOut() {
  try {
    const result = await cloudApi('logout', {method: 'POST', body: {}});
    cloudConfig.csrf = result.csrf;
    cloudUser = null;
    cloudProjects = [];
    currentCloudId = null;
    updateCloudUser();
    await prepareGoogle();
    cloudMessage('Signed out');
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

async function loadShared(slug) {
  try {
    const result = await cloudApi('public-project', {query: {slug}});
    if (result.meta.type !== 'basic') {
      throw Error('This shared link belongs to a different Studio tool.');
    }
    sharedProject = result;
    $('#sharedName').textContent = result.meta.name;
    $('#sharedOwner').textContent = 'Shared by ' + result.meta.owner;
    $('#sharedTap').href = result.meta.tapUrl;
    $('#sharedQaop').href = qaopUrl(result.meta.tapUrl);
    $('#sharedCard').hidden = false;
    openCloud();
  } catch (error) {
    cloudMessage(error.message, true);
    openCloud();
  }
}

async function initCloud() {
  try {
    cloudConfig = await cloudApi('config');
    const result = await cloudApi('me');
    cloudUser = result.user;
    updateCloudUser();
    if (cloudUser) await refreshCloud();
    else await prepareGoogle();
    const slug = new URLSearchParams(location.search).get('project');
    if (slug) await loadShared(slug);
  } catch (error) {
    cloudMessage(error.message, true);
  }
}

source.addEventListener('input', () => {
  if (source.value !== lastSource) {
    sourceUndo.push(lastSource);
    sourceUndo = sourceUndo.slice(-100);
    sourceRedo = [];
    lastSource = source.value;
    updateUndoButtons();
    setDirty();
  }
  updateLines();
});
source.addEventListener('scroll', () => lines.scrollTop = source.scrollTop);
source.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    event.preventDefault();
    source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end');
    source.dispatchEvent(new Event('input'));
  }
});
$('#validateBtn').onclick = validateProgram;
$('#exampleBtn').onclick = () => setSource(example);
$('#clearBtn').onclick = () => setSource('');
$('#tapBtn').onclick = downloadTap;
$('#basBtn').onclick = downloadBas;
$('#copyBtn').onclick = async () => {
  await navigator.clipboard.writeText(source.value);
  alert('BASIC listing copied.');
};
$('#newProject').onclick = newProject;
$('#saveProject').onclick = saveProjectFile;
$('#loadProject').onclick = () => $('#projectFile').click();
$('#importBas').onclick = () => {
  if (source.value.trim() !== '') {
    alert('BAS import is available only when the BASIC editor is empty. Clear the listing first so existing work cannot be overwritten.');
    return;
  }
  $('#basFile').click();
};
$('#projectFile').onchange = event => {
  loadProjectFile(event.target.files[0]);
  event.target.value = '';
};
$('#basFile').onchange = event => {
  importBasFile(event.target.files[0]);
  event.target.value = '';
};
$('#undoBtn').onclick = undoSource;
$('#redoBtn').onclick = redoSource;
$('#renumberBtn').onclick = renumberProgram;
$('#renumberScope').onchange = event => {
  document.querySelectorAll('.range-field').forEach(field => {
    field.hidden = event.target.value !== 'range';
  });
};
$('#cloudBtn').onclick = openCloud;
$('#openHelp').onclick = openHelp;
$('#closeHelp').onclick = closeHelp;
$('#closeHelpBottom').onclick = closeHelp;
helpOverlay.onclick = event => {
  if (event.target === helpOverlay) closeHelp();
};
$('#cloudClose').onclick = closeCloud;
cloudOverlay.onclick = event => {
  if (event.target === cloudOverlay) closeCloud();
};
$('#saveNewCloud').onclick = () => saveCloudProject();
$('#updateCloud').onclick = () => saveCloudProject(currentCloudId);
$('#refreshCloud').onclick = refreshCloud;
$('#signOutBtn').onclick = signOut;
$('#openShared').onclick = () => {
  if (!sharedProject) return;
  if (projectDirty && !confirm('Open this shared project and replace your unsaved work?')) return;
  loadProjectData(sharedProject.project, true);
  currentCloudId = null;
  $('#updateCloud').disabled = true;
  closeCloud();
};
['projectName', 'tapName', 'autostartLine'].forEach(id =>
  $('#' + id).addEventListener('input', () => setDirty())
);
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab,.tabbody').forEach(element => element.classList.remove('active'));
    tab.classList.add('active');
    $('#' + tab.dataset.tab).classList.add('active');
  };
});
document.querySelectorAll('.collapsible-panel').forEach(panel => {
  const button = panel.querySelector('.panel-toggle');
  const title = panel.querySelector('.panel-head h2').textContent;
  button.onclick = () => {
    const collapsed = panel.classList.toggle('collapsed');
    button.textContent = collapsed ? '+' : '−';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', (collapsed ? 'Expand ' : 'Collapse ') + title);
  };
});
function renderHelp(query = '') {
  const list = $('#helpList');
  list.replaceChildren();
  Object.entries(HELP)
    .filter(([name, description]) => (name + ' ' + description).toLowerCase().includes(query.toLowerCase()))
    .forEach(([name, description]) => {
      const item = document.createElement('div');
      item.className = 'help-item';
      const heading = document.createElement('b');
      heading.textContent = name;
      const text = document.createElement('span');
      text.textContent = description;
      item.append(heading, text);
      list.appendChild(item);
    });
}
$('#helpSearch').oninput = event => renderHelp(event.target.value);
window.addEventListener('beforeunload', event => {
  if (projectDirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('keydown', event => {
  if (!helpOverlay.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHelp();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...helpOverlay.querySelectorAll('a[href],button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? redoSource() : undoSource();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoSource();
  } else if (event.key === 'Escape' && !cloudOverlay.hidden) {
    closeCloud();
  }
});

renderHelp();
restoreRecovery();
updateLines();
updateUndoButtons();
validateProgram();
initCloud();
