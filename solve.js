// Fast CSV reader: a faster drop-in for csv-reader 1.0.0 (make.fun).
//
// Written from scratch in this session for the csv-reader-speed-01
// competition. It answers exactly as csv-reader 1.0.0 answers, following the
// reading policy in the competition rules:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its field count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside a quoted field counted),
//     row its record's index in rows (null for the header), in the order met,
//     a field's quote_junk when the field ends and a record's short_row or
//     long_row when the record ends.
//
// Speed comes from never walking the text one character at a time in
// JavaScript: a record whose fields are all plain (no quote, no stray CR)
// is taken as one slice and split on commas by the engine, and every other
// field is found with indexOf / a character-class scan instead of a
// per-character loop. Only the rare broken paths (a stray CR, a quoted field
// holding a line break or a doubled quote, junk after a closing quote) do
// any per-piece work, and then only on that one field.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// The next of: a quote, a CR, or an LF. One scan from the cursor finds the
// first of them, which is all a plain record's fast path needs to know.
const SPECIAL = /["\r\n]/g;
// The next field end for an unquoted field: a comma, a CR, or an LF.
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `init` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept after `init`.
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    let seg = pos;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        if (seg < n) {
          value += text.slice(seg, n);
          added += n - seg;
        }
        pos = n;
        return { value, ended: END, added };
      }
      const i = m.index;
      const c = m[0];
      if (c === ',') {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === '\n') {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: a line break when followed by LF, else a stray one, dropped.
      if (text.charCodeAt(i + 1) === 10) {
        value += text.slice(seg, i);
        added += i - seg;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      error('stray_cr');
      value += text.slice(seg, i);
      added += i - seg;
      pos = i + 1;
      seg = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote: the next quote that is not doubled.
    let q = open + 1;
    let close = -1;
    for (;;) {
      q = text.indexOf('"', q);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        q += 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as an unquoted field.
      error('unterminated_quote');
      pos = open + 1;
      line = openLine;
      return readUnquoted('"');
    }
    // The quoted stretch, [open + 1, close): doubled quotes become one
    // quote, and each CRLF or lone CR in it becomes one LF. Line breaks in
    // it are counted from the converted value, where each break is exactly
    // one LF; a stretch with no line break needs no counting at all.
    const dd = text.indexOf('""', open + 1);
    const hasDD = dd !== -1 && dd < close;
    const nl = text.indexOf('\n', open + 1);
    const hasNL = nl !== -1 && nl < close;
    const cr = text.indexOf('\r', open + 1);
    const hasCR = cr !== -1 && cr < close;
    let value;
    if (!hasDD && !hasCR && !hasNL) {
      value = text.slice(open + 1, close);
    } else {
      value = text.slice(open + 1, close);
      if (hasDD) value = value.split('""').join('"');
      if (hasCR) value = value.replace(/\r\n?/g, '\n');
      if (hasNL || hasCR) {
        let count = 0;
        let idx = -1;
        while ((idx = value.indexOf('\n', idx + 1)) !== -1) count += 1;
        line += count;
      }
    }
    pos = close + 1;
    if (pos >= n) return { value, ended: END };
    const cc = text.charCodeAt(pos);
    if (cc === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (cc === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the first quote, CR or LF from here decides the record.
    // An LF first means no quote and no CR before the line ends, so the
    // whole record is one slice split on commas; a CR first that is followed
    // by LF is the record's CRLF ending, same thing with the CR stripped.
    // Anything else (a quote, or a CR on its own) needs the slow path.
    let fields = null;
    let lastQuoted = false;
    SPECIAL.lastIndex = pos;
    const m = SPECIAL.exec(text);
    if (m === null) {
      fields = text.slice(pos).split(',');
      pos = n;
    } else if (m[0] === '\n') {
      fields = text.slice(pos, m.index).split(',');
      pos = m.index + 1;
      line += 1;
    } else if (m[0] === '\r' && text.charCodeAt(m.index + 1) === 10) {
      fields = text.slice(pos, m.index).split(',');
      pos = m.index + 2;
      line += 1;
    }
    if (fields === null) {
      // Slow path: the record holds a quote or a stray CR.
      fields = [];
      let field;
      do {
        lastQuoted = text.charCodeAt(pos) === 34;
        field = lastQuoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
