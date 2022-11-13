const selectorAndCode = /(.+)\s*{([^{}]+)}/g;
const atRules = {
    regular: /@(charset|import|namespace|layer)([^{};]+);/g,
    grouping: /@(property|counter-style|font-face|page)([^{}]+){([^{}]+)}/g,
    nesting: /@(media|supports|document|layer)([^{}]+){/,
    keyframes: /@keyframes\s+([\w-_]+){/g,
}
const emptyString = '';

interface CSSToken {
    rule: string;
    outside: string;
    inside: null|string|CSSToken[];
}

function nestingEndIndex(code: string, from: number) {
    let open = code.indexOf('{', from);
    let close = code.indexOf('}', from);
    let counter = 0;
    if(open !== -1) {
        while(true) {
            if(close === -1) return -1;
            if(close < open) {
                if(counter === 0) return close;
                close = code.indexOf('}', close+1);
                counter--; 
            } else {
                counter++;
                open = code.indexOf('{', open+1);
                if(open === -1) break;
            }
        }
    }
    while(true) {
        if(close === -1) return -1;
        if(counter === 0) return close;
        close = code.indexOf('}', close+1);
        counter--; 
    }
}

function indefOfMin(arr: number[]) {
    let j = 0;
    let min = arr[0];
    for(var i=0; i<arr.length; i++) if(arr[i] < min) {
        j = i;
        min = arr[i];
    }
    return j;
}

function exec2token(which: number, exec: RegExpExecArray): CSSToken {
    switch(which) {
        case 0: return { rule: emptyString, outside: exec[1].trim(), inside: exec[2].trim() };
        case 1: return { rule: exec[1].trim(), outside: exec[2].trim(), inside: null };
        case 2: return { rule: exec[1].trim(), outside: exec[2].trim(), inside: exec[3].trim() };
    }
    throw "unreachable";
}

const simple_regexps = [selectorAndCode, atRules.regular, atRules.grouping, atRules.keyframes];
function simple(this: void, code: string): CSSToken[] {
    const execs = new Array<RegExpExecArray|null>(4);
    const indexes = new Array<number>(4);

    const res: CSSToken[] = []
    const len = code.length;
    let e: RegExpExecArray|null;
    for(var i=0; i<4; i++) {
        e = simple_regexps[i].exec(code);
        execs[i] = e;
        indexes[i] = e ? e.index : len;
    }
    let min = indefOfMin(indexes);
    while(indexes[min] !== len) {
        e = execs[min] as RegExpExecArray;
        if(min !== 3) res.push(exec2token(min, e));
        else {
            const start = e.index + e[0].length+1;
            const end = nestingEndIndex(code, start);
            res.push({
                rule: "@keyframes",
                outside: e[1].trim(),
                inside: code.slice(start, end).trim(),
            });
        }
        e = simple_regexps[min].exec(code);
        execs[min] = e;
        indexes[min] = e ? e.index : len;
        min = indefOfMin(indexes);
    }
    return res;
}

function tokenizeCSS(code: string): CSSToken[] {
    let remainder = code;
    const pieces: CSSToken[] = [];
    let res: RegExpExecArray|null;

    while(res = atRules.nesting.exec(remainder)) {
        const last = remainder.slice(0, res.index);
        Array.prototype.push.apply(pieces, simple(last));
        const start = res.index + res[0].length + 1;
        const end = nestingEndIndex(remainder, start);
        pieces.push({
            rule: res[1],
            outside: res[2].trim(),
            inside: tokenizeCSS(remainder.slice(start, end))
        });
        remainder = remainder.slice(end+1);
    }
    Array.prototype.push.apply(pieces, simple(remainder));
    return pieces;
}


const selectorDivider = /(?:\s*([>~+])\s*)|\s+/g;
const globalSelectorPiece = /(.*)\[global\](.*)/;
function scopeSelector(sel: string, attr: string) {
    let res = '';
    let e: RegExpExecArray|null;
    let g: RegExpExecArray|null;
    let last = 0;
    let piece: string;
    while(e = selectorDivider.exec(sel)) {
        piece = sel.slice(last, e.index);
        console.log(piece);
        last = e.index + e[0].length;
        if(g = globalSelectorPiece.exec(piece)) {
            res += ((g[1]+g[2])||'*') + (e[1]||' ');
        } else {
            if(piece.startsWith('*')) piece = piece.slice(1);
            res += `[data-f="${attr}"]${piece}${e[1]||' '}`;
        }
    }
    piece = sel.slice(last);
    if(g = globalSelectorPiece.exec(piece)) {
        res += (g[1]+g[2])||'*';
    } else {
        if(piece.startsWith('*')) piece = piece.slice(1);
        res += `[data-f="${attr}"]${piece}`;
    }
    return res;
}

/**
 * Mutates the ast by scoping all the selectors
 * @param ast Abstract Syntax Tree of the CSS
 * @param attr Value of the attribute data-f to apply
 */
function scope$(ast: CSSToken[], attr: string) {
    const len = ast.length;
    let item: CSSToken;
    for(var i=0; i<len; i++) {
        item = ast[i];
        if(item.rule) {
            if(Array.isArray(item.inside)) scope$(item.inside, attr);
            continue;
        }
        item.outside = item.outside.split(',').map(p => scopeSelector(p, attr)).join(',');
    }
}

export { tokenizeCSS as tokenizeCSS };