const ANSI_COLOR: Record<string, string> = {
    '1;38;5;38': '#82AAFF',
    '1;38;5;113': '#C3E88D',
    '1;38;5;208': '#F78C6C',
    '38;5;38': '#82AAFF',
    '38;5;113': '#C3E88D',
    '38;5;170': '#C792EA',
    '38;5;208': '#F78C6C',
    '38;5;247': '#676E95',
};

export function escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string)
    );
}

export function ansiToHtml(text: string): string {
    const out: string[] = [];
    let cursor = 0;
    let openSpan = false;
    const ansiRe = /\x1b\[([0-9;]*)m/g;
    let m: RegExpExecArray | null;
    while ((m = ansiRe.exec(text)) !== null) {
        if (m.index > cursor) out.push(escapeHtml(text.slice(cursor, m.index)));
        const code = m[1];
        if (openSpan) {
            out.push('</span>');
            openSpan = false;
        }
        if (code !== '' && code !== '0' && code !== '39') {
            const color = ANSI_COLOR[code] || '#BFC7D5';
            out.push(`<span style="color:${color}">`);
            openSpan = true;
        }
        cursor = m.index + m[0].length;
    }
    if (cursor < text.length) out.push(escapeHtml(text.slice(cursor)));
    if (openSpan) out.push('</span>');
    return out.join('');
}

const PALENIGHT = {
    variable: '#BEC5D4',
    string: '#C3E88D',
    number: '#F78C6C',
    comment: '#676E95',
    keyword: '#C792EA',
    function: '#82AAFF',
    arrow: '#89DDFF',
    literal: '#FF5874',
    default: '#BFC7D5',
} as const;

const PHP_KEYWORD_TOKENS = new Set([
    'T_FUNCTION', 'T_RETURN', 'T_IF', 'T_ELSE', 'T_ELSEIF', 'T_FOR',
    'T_FOREACH', 'T_WHILE', 'T_DO', 'T_SWITCH', 'T_CASE', 'T_DEFAULT',
    'T_BREAK', 'T_CONTINUE', 'T_CLASS', 'T_INTERFACE', 'T_TRAIT',
    'T_EXTENDS', 'T_IMPLEMENTS', 'T_NEW', 'T_USE', 'T_NAMESPACE', 'T_TRY',
    'T_CATCH', 'T_FINALLY', 'T_THROW', 'T_ECHO', 'T_PRINT', 'T_VAR',
    'T_PUBLIC', 'T_PROTECTED', 'T_PRIVATE', 'T_STATIC', 'T_ABSTRACT',
    'T_FINAL', 'T_CONST', 'T_AS', 'T_INSTANCEOF', 'T_FN', 'T_YIELD',
    'T_REQUIRE', 'T_REQUIRE_ONCE', 'T_INCLUDE', 'T_INCLUDE_ONCE',
    'T_ARRAY', 'T_LIST', 'T_ISSET', 'T_UNSET', 'T_EMPTY', 'T_GLOBAL',
    'T_ENUM', 'T_MATCH', 'T_READONLY', 'T_CALLABLE',
]);

const PHP_ARROW_TOKENS = new Set([
    'T_OBJECT_OPERATOR', 'T_NULLSAFE_OBJECT_OPERATOR', 'T_DOUBLE_ARROW',
    'T_PAAMAYIM_NEKUDOTAYIM', 'T_NS_SEPARATOR',
    'T_OPEN_TAG', 'T_OPEN_TAG_WITH_ECHO', 'T_CLOSE_TAG',
]);

const PHP_LITERAL_IDENTIFIERS = new Set([
    'null', 'true', 'false', 'NULL', 'TRUE', 'FALSE',
]);

const PHP_PUNCT_OPERATORS = '=+-*/<>!.&|^~%?:';

type Token = [string | null, string];

function colorForToken(token: Token, next: Token | undefined): string {
    const [name, text] = token;
    if (name === 'T_VARIABLE') return PALENIGHT.variable;
    if (name === 'T_LNUMBER' || name === 'T_DNUMBER') return PALENIGHT.number;
    if (name === 'T_CONSTANT_ENCAPSED_STRING') return PALENIGHT.string;
    if (name === 'T_ENCAPSED_AND_WHITESPACE') return PALENIGHT.string;
    if (name === 'T_COMMENT' || name === 'T_DOC_COMMENT') return PALENIGHT.comment;
    if (name && PHP_KEYWORD_TOKENS.has(name)) return PALENIGHT.keyword;
    if (name && PHP_ARROW_TOKENS.has(name)) return PALENIGHT.arrow;
    if (name === 'T_STRING') {
        if (PHP_LITERAL_IDENTIFIERS.has(text)) return PALENIGHT.literal;
        if (next && next[1] === '(') return PALENIGHT.function;
        return PALENIGHT.default;
    }
    if (name === null && text.length === 1 && PHP_PUNCT_OPERATORS.includes(text)) {
        return PALENIGHT.keyword;
    }
    return PALENIGHT.default;
}

export function buildHighlightedHtml(tokens: Token[]): string {
    const lines: string[] = [''];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const color = colorForToken(t, tokens[i + 1]);
        const segments = t[1].split('\n');
        for (let k = 0; k < segments.length; k++) {
            if (k > 0) lines.push('');
            if (segments[k]) {
                lines[lines.length - 1] += `<span style="color:${color};">${escapeHtml(segments[k])}</span>`;
            }
        }
    }
    const numWidth = String(lines.length).length;
    return lines
        .map((line, i) => {
            const num = String(i + 1).padStart(numWidth, ' ');
            return '<div class="line">'
                + `<span style="color:#4c5374; text-align:right; -webkit-user-select:none; user-select:none;" class="line-number" contenteditable="false">${num}</span>`
                + line
                + '</div>';
        })
        .join('');
}

export function getCaretLineCol(root: HTMLElement): [number, number] | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;
    const lines = Array.from(root.querySelectorAll<HTMLElement>(':scope > .line'));
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].contains(range.startContainer)) continue;
        let col = 0;
        const walker = document.createTreeWalker(lines[i], NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
            if ((node.parentElement as HTMLElement | null)?.classList.contains('line-number')) continue;
            if (node === range.startContainer) return [i, col + range.startOffset];
            col += node.textContent?.length ?? 0;
        }
        return [i, col];
    }
    return null;
}

export function setCaretLineCol(root: HTMLElement, [lineIdx, col]: [number, number]): void {
    const lines = root.querySelectorAll<HTMLElement>(':scope > .line');
    if (lines.length === 0) return;
    const line = lines[Math.min(lineIdx, lines.length - 1)];
    let remaining = col;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
        if ((node.parentElement as HTMLElement | null)?.classList.contains('line-number')) continue;
        const len = node.textContent?.length ?? 0;
        if (remaining <= len) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
        }
        remaining -= len;
    }
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}
