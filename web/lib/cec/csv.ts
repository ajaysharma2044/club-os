/** Bounded RFC-style CSV reader. All cells stay strings; formulas are never evaluated. */
export function parseCSV(input: string): {
    headers: string[];
    rows: string[][];
} {
    if (new TextEncoder().encode(input).length > 48000)
        throw Error('CSV must be at most 48 KB.');
    const source = input.replace(/^\uFEFF/, '');
    let row: string[] = [], cell = '', quoted = false, closed = false;
    const all: string[][] = [];
    const field = () => { row.push(cell.trim()); cell = ''; closed = false; };
    const line = () => { field(); if (row.some(Boolean))
        all.push(row); row = []; };
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (quoted) {
            if (c === '"') {
                if (source[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                cell += c;
            continue;
        }
        if (c === ',') {
            field();
            continue;
        }
        if (c === '\n' || c === '\r') {
            if (c === '\r' && source[i + 1] === '\n')
                i++;
            line();
            continue;
        }
        if (closed) {
            if (c === ' ' || c === '\t')
                continue;
            throw Error('Unexpected text after a quoted field.');
        }
        if (c === '"') {
            if (cell)
                throw Error('Quotes must surround the entire field.');
            quoted = true;
        }
        else
            cell += c;
    }
    if (quoted)
        throw Error('Unclosed quoted field.');
    if (cell || row.length || closed)
        line();
    if (all.length < 2)
        throw Error('Include a header and at least one data row.');
    if (all.length > 101)
        throw Error('Import at most 100 rows at a time.');
    const headers = all.shift()!.map(v => v.toLowerCase());
    if (headers.some(v => !v) || new Set(headers).size !== headers.length)
        throw Error('Column names must be nonempty and unique.');
    if (all.some(r => r.length !== headers.length))
        throw Error('Every row must have the same number of columns as the header.');
    return { headers, rows: all };
}
