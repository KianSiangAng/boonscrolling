import { h } from './ui';

export type Lang = 'js' | 'python' | 'sql';

export const LANG_LABEL: Record<Lang, string> = { js: 'JavaScript', python: 'Python', sql: 'SQL' };

export function isLang(x: unknown): x is Lang {
  return x === 'js' || x === 'python' || x === 'sql';
}

/** Pack snippets may be a string or (more readable in JSON) an array of lines. */
export function codeLines(x: unknown): string[] | null {
  if (typeof x === 'string' && x.trim()) return x.replace(/\n$/, '').split('\n');
  if (Array.isArray(x) && x.length && x.every((l) => typeof l === 'string')) return x as string[];
  return null;
}

const KEYWORDS: Record<Lang, Set<string>> = {
  js: new Set(
    'const let var function return if else for while do of in new typeof instanceof class extends async await break continue switch case default throw try catch finally delete void yield'.split(
      ' ',
    ),
  ),
  python: new Set(
    'def return if elif else for while in not and or is import from as class lambda pass break continue with try except finally raise yield global nonlocal del assert'.split(
      ' ',
    ),
  ),
  sql: new Set(
    'select from where insert into values create table int integer text null not and or group by order having join left right inner outer on as distinct limit update set delete primary key index asc desc is'.split(
      ' ',
    ),
  ),
};

const CONSTANTS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'True',
  'False',
  'None',
  'this',
  'self',
]);

const BUILTINS: Record<Lang, Set<string>> = {
  js: new Set(['console', 'Math', 'JSON', 'Promise', 'setTimeout', 'parseInt', 'Number', 'String', 'Array', 'Object']),
  python: new Set([
    'print',
    'len',
    'range',
    'list',
    'dict',
    'set',
    'str',
    'int',
    'sorted',
    'sum',
    'min',
    'max',
    'deque',
  ]),
  sql: new Set(['count', 'sum', 'avg', 'min', 'max', 'coalesce']),
};

const COMMENT: Record<Lang, RegExp> = { js: /\/\/.*/y, python: /#.*/y, sql: /--.*/y };
const STRING = /[fFrRbB]?(?:"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)/y;
const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?/y;
const IDENT = /[A-Za-z_$][\w$]*/y;
const OPERATOR = /=>|===|!==|==|!=|<=|>=|\*\*|\/\/|<<|>>|&&|\|\||[-+*/%=<>!&|^~?:]/y;

export type Token = { text: string; kind: 'kw' | 'str' | 'num' | 'com' | 'fn' | 'bi' | 'const' | 'op' | '' };

function startsString(line: string, i: number, lang: Lang): boolean {
  if (/["'`]/.test(line[i])) return lang === 'js' || line[i] !== '`';
  // Python string prefixes: f"…", r'…', b"…"
  return (
    lang === 'python' && /[fFrRbB]/.test(line[i]) && /["']/.test(line[i + 1] ?? '') && !/[\w$]/.test(line[i - 1] ?? '')
  );
}

function sticky(re: RegExp, line: string, at: number): string | null {
  re.lastIndex = at;
  const m = re.exec(line);
  return m && m[0] ? m[0] : null;
}

/** Tokenise one line for highlighting. Deliberately small: snippets are short and single-line-scoped. */
export function tokenize(line: string, lang: Lang): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: Token['kind']) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === '') last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  while (i < line.length) {
    let m: string | null;
    if ((m = sticky(COMMENT[lang], line, i))) {
      push(m, 'com');
    } else if (startsString(line, i, lang) && (m = sticky(STRING, line, i))) {
      push(m, 'str');
    } else if (/\d/.test(line[i]) && (i === 0 || !/[\w$]/.test(line[i - 1])) && (m = sticky(NUMBER, line, i))) {
      push(m, 'num');
    } else if ((m = sticky(IDENT, line, i))) {
      const key = lang === 'sql' ? m.toLowerCase() : m;
      const next = line.slice(i + m.length).trimStart()[0];
      if (KEYWORDS[lang].has(key)) push(m, 'kw');
      else if (CONSTANTS.has(m)) push(m, 'const');
      else if (BUILTINS[lang].has(key)) push(m, 'bi');
      else if (next === '(') push(m, 'fn');
      else push(m, '');
    } else if ((m = sticky(OPERATOR, line, i))) {
      push(m, 'op');
    } else {
      m = line[i];
      push(m, '');
    }
    i += m!.length;
  }
  return out;
}

export function highlightLine(line: string, lang: Lang): HTMLElement {
  const el = h('span', { class: 'code-line' });
  for (const t of tokenize(line, lang)) el.append(t.kind ? h('span', { class: `tok-${t.kind}` }, t.text) : t.text);
  if (!line) el.append('​'); // keep empty lines one line tall
  return el;
}

/** A read-only, highlighted code block. */
export function codeBlock(lines: string[], lang: Lang): HTMLElement {
  return h(
    'figure',
    { class: 'code', 'aria-label': `${LANG_LABEL[lang]} code` },
    h('figcaption', { class: 'code-lang' }, LANG_LABEL[lang]),
    h(
      'pre',
      null,
      h('code', null, ...lines.flatMap((l, i) => (i ? ['\n', highlightLine(l, lang)] : [highlightLine(l, lang)]))),
    ),
  );
}

/** Regex pattern with light token colouring (classes, groups, quantifiers, anchors, escapes). */
export function regexView(pattern: string, flags = ''): HTMLElement {
  const el = h('code', { class: 'regex' }, h('span', { class: 'tok-op' }, '/'));
  const re = /\\.|\[(?:\\.|[^\]\\])*\]|\(\?[:=!<]?|[()]|[*+?]\??|\{\d+(?:,\d*)?\}\??|[\^$|.]|[^\\[\](){}*+?^$|.]+/g;
  for (const m of pattern.match(re) ?? []) {
    const kind = m.startsWith('\\')
      ? 'bi'
      : m.startsWith('[')
        ? 'str'
        : /^[()]|^\(\?/.test(m)
          ? 'kw'
          : /^[*+?{]/.test(m)
            ? 'num'
            : /^[\^$|.]$/.test(m)
              ? 'op'
              : '';
    el.append(kind ? h('span', { class: `tok-${kind}` }, m) : m);
  }
  el.append(h('span', { class: 'tok-op' }, `/${flags}`));
  return el;
}
