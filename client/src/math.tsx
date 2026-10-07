import katex from "katex";
import type { ReactNode } from "react";

type Segment = { kind: "text" | "math"; value: string; original?: string; display?: boolean };
type Range = { start: number; end: number };

function convertSqrt(value: string): string {
  const lower = value.toLowerCase();
  const start = lower.lastIndexOf("sqrt(");
  if (start < 0) return value;

  let depth = 1;
  let end = start + 5;
  while (end < value.length && depth > 0) {
    const character = value[end];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    end += 1;
  }
  if (depth !== 0) return value;

  const inner = value.slice(start + 5, end - 1);
  const replaced = `${value.slice(0, start)}\\sqrt{${convertSqrt(inner)}}${value.slice(end)}`;
  return convertSqrt(replaced);
}

export function plainMathToLatex(value: string) {
  let latex = value.trim();
  latex = convertSqrt(latex);
  latex = latex.replace(/integral_([^\s^]+)\^([^\s]+)/gi, (_match, lower: string, upper: string) => `\\int_{${lower}}^{${upper}}`);
  latex = latex.replace(/\bintegral\b/gi, "\\int");
  latex = latex.replace(/\binfinity\b/gi, "\\infty");
  latex = latex.replace(/\b(arctan|sin|cos|tan|sec|csc|cot|ln)\b/gi, "\\$1");
  latex = latex.replace(/([A-Za-z0-9)]+)\^\(([^)]+)\)/g, "$1^{$2}");
  latex = latex.replace(/([A-Za-z0-9)]+)\^(-?[A-Za-z0-9]+)/g, "$1^{$2}");
  latex = latex.replace(/\b([A-Za-z0-9]+(?:\^\{[^}]+\})?|\([^()]*\))\/([A-Za-z0-9]+(?:\^\{[^}]+\})?|\([^()]*\))/g, "\\frac{$1}{$2}");
  // The leading word boundary in the legacy token rule intentionally prevents
  // prose punctuation from joining a fraction. Parenthesized numerators need
  // the equivalent bounded case because `(` itself has no word boundary.
  latex = latex.replace(/(\([^()]*\))\/([A-Za-z0-9]+(?:\^\{[^}]+\})?|\([^()]*\))/g, "\\frac{$1}{$2}");
  latex = latex.replace(/\bln\|([^|]+)\|/gi, "\\ln\\lvert $1\\rvert");
  latex = latex.replace(/\*+/g, "\\cdot ");
  latex = latex.replace(/\s*->\s*/g, " \\to ");
  latex = latex.replace(/\s*>=\s*/g, " \\ge ");
  latex = latex.replace(/\s*<=\s*/g, " \\le ");
  latex = latex.replace(/\bd([a-z])\b/gi, "\\,d$1");
  latex = latex.replace(/\bpi\b/gi, "\\pi");
  latex = latex.replace(/theta/gi, "\\theta");
  return latex;
}

function explicitSegments(text: string): Segment[] | null {
  const pattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push(...implicitSegments(text.slice(cursor, index)));
    const raw = match[0] ?? "";
    const original = raw.slice(2, -2);
    segments.push({ kind: "math", value: original, original, display: raw.startsWith("\\[") });
    cursor = index + raw.length;
  }
  if (cursor < text.length) segments.push(...implicitSegments(text.slice(cursor)));
  return segments;
}

const braced = String.raw`\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`;
const scriptArgument = String.raw`(?:${braced}|[A-Za-z0-9]+)`;
const scripts = String.raw`(?:_(?:${scriptArgument})|\^(?:${scriptArgument}))*`;
const commandArgument = String.raw`(?:${braced}|\\?[A-Za-z]+|\([^)]*\))?`;
const fraction = String.raw`\\frac\s*${braced}\s*${braced}`;
const command = String.raw`\\(?:sqrt|sin|cos|tan|sec|csc|cot|ln|pi|theta|int|infty|sum|prod|lim|text|vec|hat|bar|pm|times|neq|approx)${scripts}${commandArgument}`;
const explicitCommandTestPattern = new RegExp(`${fraction}|${command}`, "i");
const plainTriggerPattern = /\bintegral\b|\binfinity\b|[A-Za-z0-9)]\^|\bln\||->/i;
const slashTriggerPattern = /\b([A-Za-z0-9]+(?:\^\{[^}]+\})?|\([^()]*\))\/([A-Za-z0-9]+(?:\^\{[^}]+\})?|\([^()]*\))/i;

function hasMathTrigger(value: string) {
  if (explicitCommandTestPattern.test(value) || plainTriggerPattern.test(value)) return true;
  const slash = value.match(slashTriggerPattern);
  if (!slash) return false;
  const numerator = slash[1] ?? "";
  const denominator = slash[2] ?? "";
  // Keep ordinary prose such as “and/or” out of KaTeX while accepting x/y,
  // dx/x, 2x/x^{2}, and parenthesized formula tokens.
  const formulaName = /^(?:[A-Za-z]|d[A-Za-z]|sin|cos|tan|sec|csc|cot|ln|pi|theta)$/i;
  return /[0-9^()]/.test(numerator + denominator) || formulaName.test(numerator) && formulaName.test(denominator);
}

function trimToken(raw: string) {
  return raw.replace(/^[“”"'`]+/, "").replace(/[“”"'`,;:!?]+$/, "").replace(/\.(?!\d)$/, "");
}

function isFormulaToken(raw: string) {
  const token = trimToken(raw);
  if (!token) return false;
  if (hasMathTrigger(token)) return true;
  if (/^(?:[+*/=<>]|<=|>=|->|−|-)$/.test(token)) return true;
  if (/^(?:integral|infinity|sqrt|arctan|sin|cos|tan|sec|csc|cot|ln|pi|theta|dx|du|dv)$/i.test(token)) return true;
  if (/^[A-Za-z]$/.test(token) || /^d[A-Za-z]$/.test(token) || /^\d+(?:\.\d+)?$/.test(token)) return true;
  if (/^[()[\]{}|]+$/.test(token)) return true;
  // A compact token with mathematical punctuation or a digit is formula-like;
  // ordinary multi-word prose is intentionally rejected here.
  return /^[A-Za-z0-9\\()[\]{}|.+*/^_=<>−-]+$/.test(token)
    && /[0-9\\()[\]{}|+*/^_=<>−]/.test(token);
}

function tokenEndsClause(raw: string) {
  return /^(?:--|—|–)$/.test(raw) || /[,:;!?]$/.test(raw) || /\.$/.test(raw) && !/\d\.\d$/.test(raw);
}

function formulaRanges(text: string): Range[] {
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + (match[0]?.length ?? 0),
    raw: match[0] ?? "",
  }));
  const ranges: Range[] = [];

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (!token) continue;
    const previous = tokens[tokenIndex - 1];
    const next = tokens[tokenIndex + 1];
    const standaloneSlash = token.raw === "/" && previous && next && isFormulaToken(previous.raw) && isFormulaToken(next.raw);
    if (!hasMathTrigger(token.raw) && !standaloneSlash) continue;

    let first = tokenIndex;
    let last = tokenIndex;
    while (first > 0) {
      const candidate = tokens[first - 1];
      if (!candidate || tokenEndsClause(candidate.raw) || !isFormulaToken(candidate.raw)) break;
      first -= 1;
    }
    while (last + 1 < tokens.length) {
      const current = tokens[last];
      const candidate = tokens[last + 1];
      if (!current || !candidate || tokenEndsClause(current.raw) || !isFormulaToken(candidate.raw)) break;
      last += 1;
      if (tokenEndsClause(candidate.raw)) break;
    }

    const firstToken = tokens[first];
    const lastToken = tokens[last];
    if (!firstToken || !lastToken) continue;
    let start = firstToken.start;
    let end = lastToken.end;
    while (start < end && /[“”"'`]/.test(text[start] ?? "")) start += 1;
    while (end > start && /[“”"'`,;:!?]/.test(text[end - 1] ?? "")) end -= 1;
    if (end > start && text[end - 1] === "." && !/\d\.\d$/.test(text.slice(start, end))) end -= 1;
    if (start < end && (hasMathTrigger(text.slice(start, end)) || text.slice(start, end).includes(" / "))) ranges.push({ start, end });
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  return ranges.reduce<Range[]>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

export function implicitSegments(text: string): Segment[] {
  const ranges = formulaRanges(text);
  if (!ranges.length) return [{ kind: "text", value: text }];
  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ kind: "text", value: text.slice(cursor, range.start) });
    const original = text.slice(range.start, range.end);
    const alreadyLatex = explicitCommandTestPattern.test(original);
    segments.push({ kind: "math", value: alreadyLatex ? original : plainMathToLatex(original), original });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

function MathSpan({ value, original, display = false }: { value: string; original: string; display?: boolean }) {
  try {
    const html = katex.renderToString(value, { displayMode: display, throwOnError: true, strict: false, trust: false, output: "html" });
    return <span className={display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <span>{original}</span>;
  }
}

export function segmentsForMathText(text: string): Segment[] {
  return explicitSegments(text) ?? implicitSegments(text);
}

export function MathText({ text }: { text: string }) {
  const segments = segmentsForMathText(text);
  const children: ReactNode[] = segments.map((segment, index) => segment.kind === "math"
    ? <MathSpan key={`${segment.kind}-${index}`} value={segment.value} original={segment.original ?? segment.value} display={segment.display} />
    : <span key={`${segment.kind}-${index}`}>{segment.value}</span>);
  return <>{children}</>;
}
