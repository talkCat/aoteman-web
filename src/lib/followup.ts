import type { FollowupQuestion } from '@/types/agent';

export interface FollowupOption {
  label: string;
  value?: string;
  description?: string;
}

const QUESTION_FIELD_SOURCE = '"question"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"';
const LABEL_FIELD_SOURCE = '"label"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"';
const DESCRIPTION_FIELD_SOURCE = '"description"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"';

function matches(source: string, text: string): RegExpMatchArray[] {
  const pattern = new RegExp(source, 'g');
  const found: RegExpMatchArray[] = [];
  let match = pattern.exec(text);
  while (match) {
    found.push(match);
    match = pattern.exec(text);
  }
  return found;
}

function unescapeJson(value: string): string {
  if (!value.includes('\\')) return value;
  return value.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_all, esc: string) => {
    switch (esc[0]) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'u':
        return String.fromCharCode(parseInt(esc.slice(1), 16));
      default:
        return esc;
    }
  });
}

/** 补齐未闭合的括号 / 字符串，处理「模型输出被截断」的情况。 */
function closeOpenStructures(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }
  if (!stack.length && !inString) return text;
  let repaired = text;
  if (inString) repaired += '"';
  while (stack.length) repaired += stack.pop() === '{' ? '}' : ']';
  return repaired;
}

function fromFirstBracket(text: string): string | null {
  const square = text.indexOf('[');
  const curly = text.indexOf('{');
  const start = square < 0 ? curly : curly < 0 ? square : Math.min(square, curly);
  return start < 0 ? null : text.slice(start);
}

function tryParse(text: string): unknown {
  const candidates = [text, closeOpenStructures(text), fromFirstBracket(text)];
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 尝试下一种修复策略
    }
  }
  return undefined;
}

/** 兼容「已经是对象」「JSON 字符串」「残缺 JSON 文本」三种形态。 */
function coerce(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const parsed = tryParse(trimmed);
  return parsed === undefined ? raw : parsed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeOption(out: FollowupOption[], item: unknown): void {
  if (item == null) return;
  if (typeof item === 'string') {
    const label = item.trim();
    if (label) out.push({ label });
    return;
  }
  let record = asRecord(item);
  if (!record) record = asRecord(coerce(item));
  if (!record) return;
  const rawLabel = record.label ?? record.value;
  if (rawLabel == null || String(rawLabel).trim() === '') return;
  const option: FollowupOption = { label: String(rawLabel) };
  if (record.value != null) option.value = String(record.value);
  if (record.description != null) option.description = String(record.description);
  out.push(option);
}

function normalizeOptions(raw: unknown): FollowupOption[] {
  const options: FollowupOption[] = [];
  const node = coerce(raw);
  if (Array.isArray(node)) {
    node.forEach((item) => normalizeOption(options, item));
  } else if (asRecord(node)) {
    normalizeOption(options, node);
  } else if (typeof node === 'string' && node.trim()) {
    matches(LABEL_FIELD_SOURCE, node).forEach((match) => normalizeOption(options, unescapeJson(match[1])));
    if (!options.length) normalizeOption(options, node);
  }
  return options;
}

/** 从残缺文本里抽取问题与选项，作为最后兜底。 */
function salvage(text: string): FollowupQuestion[] {
  const questions: FollowupQuestion[] = [];
  if (!text || !text.trim()) return questions;
  const questionMatches = matches(QUESTION_FIELD_SOURCE, text);
  questionMatches.forEach((match, index) => {
    const from = (match.index ?? 0) + match[0].length;
    const next = questionMatches[index + 1];
    const to = next ? (next.index ?? text.length) : text.length;
    const segment = text.slice(from, Math.max(from, to));
    const labels = matches(LABEL_FIELD_SOURCE, segment);
    const options: FollowupOption[] = labels.map((labelMatch, labelIndex) => {
      const labelEnd = (labelMatch.index ?? 0) + labelMatch[0].length;
      const labelNext = labels[labelIndex + 1];
      const tailEnd = labelNext ? (labelNext.index ?? segment.length) : segment.length;
      const tail = segment.slice(labelEnd, Math.max(labelEnd, tailEnd));
      const descriptionMatch = matches(DESCRIPTION_FIELD_SOURCE, tail)[0];
      const option: FollowupOption = { label: unescapeJson(labelMatch[1]) };
      if (descriptionMatch && descriptionMatch[1].trim()) {
        option.description = unescapeJson(descriptionMatch[1]);
      }
      return option;
    });
    questions.push({ question: unescapeJson(match[1]), options });
  });
  return questions;
}

/** 归一化 questions 字段，容忍数组 / JSON 字符串 / 残缺 JSON。 */
export function normalizeQuestions(raw: unknown): FollowupQuestion[] {
  const questions: FollowupQuestion[] = [];
  const node = coerce(raw);
  const pushQuestion = (item: unknown) => {
    let record = asRecord(item);
    if (!record) record = asRecord(coerce(item));
    if (!record) return;
    const text = record.question;
    if (text == null || String(text).trim() === '') return;
    questions.push({ question: String(text), options: normalizeOptions(record.options) });
  };
  if (Array.isArray(node)) node.forEach(pushQuestion);
  else if (asRecord(node)) pushQuestion(node);
  if (!questions.length && typeof raw === 'string') questions.push(...salvage(raw));
  return questions;
}

/**
 * 归一化 ask_followup_questions 的工具入参。
 *
 * 后端已做归一化，这里作为二次兜底：历史事件、旧数据或流式截断都可能让
 * questions 变成字符串或残缺 JSON，解析失败会让问卷卡片永远无法渲染。
 */
export function normalizeFollowupInput(rawInput: unknown): FollowupQuestion[] {
  let record = asRecord(coerce(rawInput));
  if (!record && typeof rawInput === 'string') record = asRecord(coerce(rawInput));
  if (!record) return [];
  if (record.questions == null && typeof record._raw === 'string') {
    const reparsed = asRecord(coerce(record._raw));
    if (reparsed?.questions != null) record = reparsed;
    else return normalizeQuestions(record._raw);
  }
  return normalizeQuestions(record.questions);
}
