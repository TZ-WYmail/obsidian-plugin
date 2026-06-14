import { FlashcardsSettings } from "./settings";

export type CardMode = "qa" | "knowledge";
export type GeneratedFlashcards = string[];

export interface FlashcardsGenerationProgress {
  onDelta?: (delta: string) => void;
  onRetry?: () => void;
  signal?: AbortSignal;
}

export interface FlashcardsGenerationResult {
  cards: GeneratedFlashcards;
  raw: string;
}

export function normalizeSourceText(text: string): string {
  return text
    .replace(/<u\b[^>]*data-flashcards-llm-key=["'][^"']+["'][^>]*>/gi, "")
    .replace(/<\/u>/gi, "")
    .replace(/^\s*%%\s*flashcards-llm-key-point:(?:start\s+id=[^\s%]+|end)\s*%%\s*$/gim, "")
    .replace(/%%\s*flashcards-llm-key-point:id=[^\s%]+\s*%%/gi, "")
    .replace(/==([\s\S]*?)==/g, "$1")
    .replace(/<!--.*?-->/gs, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSourceTextForCard(text: string): string {
  return text
    .replace(/<u\b[^>]*data-flashcards-llm-key=["'][^"']+["'][^>]*>/gi, "")
    .replace(/<\/u>/gi, "")
    .replace(/^\s*%%\s*flashcards-llm-key-point:(?:start\s+id=[^\s%]+|end)\s*%%\s*$/gim, "")
    .replace(/%%\s*flashcards-llm-key-point:id=[^\s%]+\s*%%/gi, "")
    .replace(/==([\s\S]*?)==/g, "$1")
    .replace(/<!--.*?-->/gs, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildSourceHash(text: string): string {
  const normalized = normalizeSourceText(text);
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, apiPath: string): string {
  const root = normalizeBaseUrl(baseUrl);
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${root}${path}`;
}

function buildHeaders(settings: FlashcardsSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const extra = settings.extraHeadersJson?.trim();
  if (settings.apiKey) {
    headers[settings.authHeader || "Authorization"] = `${settings.authPrefix ?? "Bearer "}${settings.apiKey}`;
  }
  if (extra) {
    try {
      Object.assign(headers, JSON.parse(extra));
    } catch {
      throw new Error("额外请求头 JSON 格式无效");
    }
  }
  return headers;
}

function stripExistingCards(text: string): string {
  const marker = /<!-- CARD -->[\s\S]*?(?=(?:\n<!-- CARD -->|\s*$))/g;
  return text.replace(marker, "").trim();
}

function buildModeInstructions(mode: CardMode): string[] {
  if (mode === "qa") {
    return [
      "请只把材料整理成问答卡片。",
      "每张问答卡必须严格使用下面的结构：",
      "START",
      "Basic",
      "Q: ...",
      "A: ...",
      "END",
      "每个问题只考察一个记忆点，问题和答案都使用中文，答案保持简洁准确。",
      "先从材料中提取一个可命名的考察对象，再围绕它提问；考察对象可以是术语、函数名、类名、规则名、条件、标题关键词或列表所属主题。",
      "Q 必须包含原文里的具体锚点：术语、函数名、类名、标题关键词、规则名或条件，不能只问抽象总结。",
      "严禁输出这类泛化问题：`这段内容的核心知识点是什么？`、`上述内容说明了什么？`、`请概括这段材料`、`这个知识点是什么？`、`这段材料主要讲了什么？`。",
      "严禁把书名、章节名或文件名当作唯一提问对象，例如 `流畅的Python 的核心知识点是什么？` 仍然是不合格题干。",
      "如果原文是标题加列表，优先围绕标题生成具体问题，例如 `MutableSequence（可变序列）的扩展方法有哪些？`。",
      "如果原文是一组方法、属性或步骤，Q 要问所属对象的清单或差异，A 用顿号列出名称并附极短解释。",
      "合格示例：`Q: MutableSequence（可变序列）的扩展方法有哪些？` `A: setitem、delitem、insert、append、reverse、extend、pop、remove、iadd。`",
      "A 不要整段照抄原文；如果答案是列表，只保留必要项目和极短解释，避免把一整段笔记塞进同一张卡。",
      "输出前自检：只看 Q 时，学习者必须知道要回忆哪个具体对象；如果不知道，就重写 Q。",
      "即使材料很短，也必须至少生成 1 张卡片，不能返回空内容。"
    ];
  }

  return [
    "请把材料直接整理成知识点卡片。",
    "如果原句适合直接记忆，优先生成填空卡片。",
    "填空卡必须严格使用下面的结构：",
    "START",
    "Cloze",
    "含有 {{c1::填空内容}} 的完整句子。",
    "END",
    "如果不适合做填空卡，可以改用下面的问答结构：",
    "START",
    "Basic",
    "Q: ...",
    "A: ...",
    "END",
    "知识点要原子化，避免把多个无关事实塞进同一张卡。",
    "问答结构中的 Q 必须包含具体术语或标题关键词，严禁使用 `这段内容的核心知识点是什么？` 这类泛化题干。",
    "即使材料很短，也必须至少生成 1 张卡片，不能返回空内容。"
  ];
}

function buildTwoSidedKnowledgePrompt(additionalPrompt: string): string {
  const promptParts = [
    "你是 Obsidian 到 Anki 的制卡助手。",
    "用户会提供一段已经划重点的笔记原文。",
    "请只为这段原文生成一张双面知识点卡片的正面提示。",
    "正面提示必须是一个简洁的问题、概念提示或回忆线索，用中文输出。",
    "正面提示必须包含原文中的具体术语、标题关键词、函数名、类名或规则名。",
    "严禁输出 `这段重点原文说明了什么核心知识点？`、`这段内容的核心知识点是什么？` 等泛化提示。",
    "不要在正面里直接泄露答案，不要复述整段原文。",
    "不要输出 `Q:`、`A:`、标题、解释、列表、代码块或 Obsidian_to_Anki 结构。",
    "只输出正面提示文本本身。"
  ];
  let prompt = promptParts.join("\n");
  if (additionalPrompt.trim()) {
    prompt += `\n额外要求：\n${additionalPrompt.trim()}`;
  }
  return prompt;
}

function buildPrompt(mode: CardMode, count: number, systemPrompt: string, additionalPrompt: string): string {
  if (systemPrompt.trim()) {
    return systemPrompt.trim();
  }
  const promptParts = [
    "你是 Obsidian 到 Anki 的制卡助手，负责把 Obsidian 笔记整理成可被 Obsidian_to_Anki 识别的卡片。",
    `最多生成 ${count} 张卡片；如果原文信息不足，可以只生成 1 到 ${count} 张。`,
    "只输出 markdown 文本。",
    "每张卡片都必须以 `<!-- CARD -->` 开始。",
    "不要在卡片外添加解释、标题、项目符号或额外说明。",
    "每张卡片只覆盖一个独立记忆点，避免重复。",
    "所有问题都必须具体、可回答、可复习；题干必须暴露被考察对象，但不能泄露答案。",
    "禁止把 `这段内容`、`上述内容`、`材料`、`核心知识点`、`主要内容` 当作主要提问对象。",
    "禁止输出需要重新阅读原文才能知道在问什么的问题；问题必须脱离原文也能明确考察对象。",
    "如果无法生成完美卡片，也要输出最合理的一张卡片，绝不能返回空白。",
    ...buildModeInstructions(mode)
  ];
  let prompt = promptParts.join("\n");
  if (additionalPrompt.trim()) {
    prompt += `\n额外要求：\n${additionalPrompt.trim()}`;
  }
  return prompt;
}

function stripOuterCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```[\w-]*\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
}

function parseCards(raw: string): string[] {
  const cleaned = stripOuterCodeFence(raw);
  const parts = cleaned.includes("<!-- CARD -->") ? cleaned.split(/<!-- CARD -->/g) : [cleaned];
  return parts
    .map((part) => part.trim())
    .map(stripOuterCodeFence)
    .filter((card) => card.length > 0);
}

interface BasicCardFields {
  question: string;
  answer: string;
}

function extractBasicCardFields(card: string): BasicCardFields | null {
  const match = card.match(/START\s*\nBasic\s*\nQ:\s*([\s\S]*?)\nA:\s*([\s\S]*?)\nEND/i);
  if (!match) {
    return null;
  }
  return {
    question: match[1].trim(),
    answer: match[2].trim()
  };
}

function improveCardQuality(cards: string[], source: string, mode: CardMode): string[] {
  const fallback = buildFallbackCard(source, mode);
  const improved = cards.map((card) => {
    const fields = extractBasicCardFields(card);
    if (mode === "qa" && !fields) {
      return fallback;
    }
    return fields && isLowQualityBasicCard(fields, source) ? fallback : card;
  });
  return dedupeCards(improved);
}

function dedupeCards(cards: string[]): string[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const normalized = card.replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function isLowQualityBasicCard(fields: BasicCardFields, source: string): boolean {
  if (isLowQualityQuestionText(fields.question, source)) {
    return true;
  }

  const answer = fields.answer.replace(/\s+/g, " ").trim();
  if (!answer) {
    return true;
  }

  return isBloatedCopyAnswer(answer, source);
}

function isLowQualityQuestionText(questionText: string, source: string): boolean {
  const question = questionText.replace(/\s+/g, " ").trim();
  const anchors = extractSourceAnchors(source);
  if (!question) {
    return true;
  }

  if (hasBannedGenericQuestion(question)) {
    return true;
  }

  if (question.length < 8 && !containsSourceAnchor(question, source)) {
    return true;
  }

  return anchors.length > 0 && looksLikeDetachedQuestion(question) && !containsSourceAnchor(question, source);
}

function hasBannedGenericQuestion(question: string): boolean {
  const compact = question.replace(/\s+/g, "");
  return /这段|上述|原文|本段|本节|这份?材料|这些?内容|该内容|核心知识点|主要内容|主要讲.*什么|讲了什么|说明.*什么|总结|概括|知识点是什么|是什么核心/.test(compact);
}

function looksLikeDetachedQuestion(question: string): boolean {
  return /^(?:什么|哪些|如何|为什么|怎样|怎么|请|列出|说明|解释|总结|概括)/.test(question);
}

function isBloatedCopyAnswer(answer: string, source: string): boolean {
  const normalizedAnswer = normalizeSourceText(answer);
  if (normalizedAnswer.length < 360) {
    return false;
  }

  const normalizedSource = normalizeSourceText(source);
  const hasMarkdownStructure = /#{1,6}\s|(?:^|\s)(?:[-+*]|\d+[.)])\s+/.test(answer);
  return hasMarkdownStructure && normalizedSource.includes(normalizedAnswer.slice(0, 120));
}

function containsSourceAnchor(question: string, source: string): boolean {
  const normalizedQuestion = question.toLowerCase();
  return extractSourceAnchors(source).some((anchor) => normalizedQuestion.includes(anchor.toLowerCase()));
}

function extractSourceAnchors(source: string): string[] {
  const cleaned = cleanSourceTextForCard(source);
  const anchors = new Set<string>();
  const topic = extractTopicFromSource(cleaned);

  if (topic) {
    anchors.add(topic);
    for (const part of topic.split(/[（()：:，,、\s]+/g)) {
      if (part.trim().length >= 2) {
        anchors.add(part.trim());
      }
    }
    const chineseTermPattern = /[\u4e00-\u9fff]{2,}/g;
    let chineseTermMatch: RegExpExecArray | null;
    while ((chineseTermMatch = chineseTermPattern.exec(topic)) !== null) {
      anchors.add(chineseTermMatch[0]);
    }
  }

  const codeTermPattern = /`([^`\n]{2,80})`/g;
  let codeTermMatch: RegExpExecArray | null;
  while ((codeTermMatch = codeTermPattern.exec(cleaned)) !== null) {
    anchors.add(stripMarkdownInline(codeTermMatch[1]));
  }
  const identifierPattern = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
  let identifierMatch: RegExpExecArray | null;
  while ((identifierMatch = identifierPattern.exec(cleaned)) !== null) {
    anchors.add(identifierMatch[0]);
  }

  return Array.from(anchors)
    .map((anchor) => anchor.trim())
    .filter((anchor) => anchor.length >= 2 && anchor.length <= 80)
    .slice(0, 40);
}

function extractTopicFromSource(source: string): string {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)(?:[：:]\s*)?$/);
    if (heading) {
      return stripMarkdownInline(heading[1]).replace(/[：:]\s*$/, "").trim();
    }
  }

  const firstLine = lines.find((line) => !/^(?:[-+*]|\d+[.)])\s+/.test(line)) ?? "";
  if (firstLine && firstLine.length <= 100) {
    return stripMarkdownInline(firstLine).replace(/[：:]\s*$/, "").trim();
  }

  return "";
}

function extractListItemTerms(source: string): string[] {
  const cleaned = cleanSourceTextForCard(source);
  const terms: string[] = [];

  for (const line of cleaned.split(/\r?\n/)) {
    const item = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (!item) {
      continue;
    }
    const term = extractTermFromListItem(item[1]);
    if (term) {
      terms.push(term);
    }
  }

  if (!terms.length) {
    const looseListPattern = /(?:^|\s)-\s+([^。；;\n]+)/g;
    let looseListMatch: RegExpExecArray | null;
    while ((looseListMatch = looseListPattern.exec(cleaned)) !== null) {
      const term = extractTermFromListItem(looseListMatch[1]);
      if (term) {
        terms.push(term);
      }
    }
  }

  return Array.from(new Set(terms)).slice(0, 16);
}

function extractTermFromListItem(item: string): string {
  const codeTerm = item.match(/`([^`]+)`/);
  if (codeTerm) {
    return stripMarkdownInline(codeTerm[1]);
  }

  const beforeExplanation = item.split(/[：:，,。；;\-—–]/)[0] ?? "";
  return stripMarkdownInline(beforeExplanation).trim();
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/, "")
    .trim();
}

function buildSpecificQuestion(source: string): string {
  const topic = extractTopicFromSource(source);
  const terms = extractListItemTerms(source);
  const anchors = extractSourceAnchors(source);

  if (terms.length >= 2 && topic) {
    return `${topic}有哪些？`;
  }
  if (terms.length >= 2 && anchors[0]) {
    return `与 ${anchors[0]} 相关的关键项目有哪些？`;
  }
  if (topic) {
    return `${topic}的关键结论是什么？`;
  }
  if (anchors[0]) {
    return `${anchors[0]} 的作用或含义是什么？`;
  }
  return "这条笔记对应的具体结论是什么？";
}

function buildConciseFallbackAnswer(source: string): string {
  const terms = extractListItemTerms(source);
  if (terms.length >= 2) {
    const shown = terms.slice(0, 12).join("、");
    return `包括 ${shown}${terms.length > 12 ? " 等" : ""}。`;
  }

  return normalizeSourceText(source).slice(0, 260);
}

function buildFallbackCard(source: string, mode: CardMode): string {
  const compactSource = normalizeSourceText(source).slice(0, 500);

  if (!compactSource) {
    throw new Error("选中文本或高亮内容为空，无法生成卡片");
  }

  if (mode === "knowledge") {
    return [
      "START",
      "Cloze",
      `{{c1::${compactSource}}}`,
      "END"
    ].join("\n");
  }

  return [
    "START",
    "Basic",
    `Q: ${buildSpecificQuestion(source)}`,
    `A: ${buildConciseFallbackAnswer(source)}`,
    "END"
  ].join("\n");
}

function buildTwoSidedKnowledgeFallback(source: string): string {
  const compactSource = normalizeSourceText(source).slice(0, 500);
  if (!compactSource) {
    throw new Error("重点原文为空，无法生成双面知识点卡片");
  }
  return [
    "START",
    "Basic",
    `Q: ${buildSpecificQuestion(source)}`,
    `A: ${formatOriginalTextForAnswer(compactSource)}`,
    "END"
  ].join("\n");
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`请求失败：${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`);
  }
  return response;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return contentToText(record.text ?? record.content ?? record.output_text);
        }
        return "";
      })
      .join("");
  }
  return "";
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }
  const record = data as Record<string, unknown>;
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as Record<string, unknown>;
    const delta = choice.delta as Record<string, unknown> | undefined;
    const message = choice.message as Record<string, unknown> | undefined;
    return (
      contentToText(delta?.content) ||
      contentToText(delta?.text) ||
      contentToText(message?.content) ||
      contentToText(choice.text)
    );
  }

  const outputText = contentToText(record.output_text) || contentToText(record.response);
  if (outputText) {
    return outputText;
  }

  const output = record.output;
  if (Array.isArray(output)) {
    return output.map((item) => contentToText((item as Record<string, unknown>)?.content)).join("");
  }

  return "";
}

function cleanupSingleLine(raw: string): string {
  return stripOuterCodeFence(raw)
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/^Q[:：]\s*/i, "")
    .replace(/^问题[:：]\s*/i, "")
    .trim();
}

export function formatOriginalTextForAnswer(source: string): string {
  return cleanSourceTextForCard(source)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n/g, "<br>");
}

async function readJsonResponse(response: Response): Promise<string> {
  const data = await response.json();
  return extractResponseText(data).trim();
}

function payloadToDelta(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === "[DONE]") {
    return "";
  }

  try {
    return extractResponseText(JSON.parse(trimmed));
  } catch {
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return payload;
    }
    return null;
  }
}

function getDataPayloads(block: string): string[] {
  const dataLines = block
    .split("\n")
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));

  if (dataLines.length === 0) {
    const trimmed = block.trim();
    return trimmed ? [trimmed] : [];
  }

  const canParseSeparately = dataLines.length > 1 && dataLines.every((line) => {
    const trimmed = line.trim();
    return trimmed === "[DONE]" || trimmed.startsWith("{") || trimmed.startsWith("[");
  });

  return canParseSeparately ? dataLines : [dataLines.join("\n")];
}

async function readStreamResponse(response: Response, onDelta?: (delta: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let result = "";

  const appendDelta = (delta: string) => {
    if (!delta) return;
    result += delta;
    onDelta?.(delta);
  };

  const processEventBlock = (block: string): boolean => {
    const payloads = getDataPayloads(block);
    for (const payload of payloads) {
      const delta = payloadToDelta(payload);
      if (delta === null) {
        return false;
      }
      appendDelta(delta);
    }
    return true;
  };

  const processCompleteEvents = () => {
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      processEventBlock(block);
      separatorIndex = buffer.indexOf("\n\n");
    }
  };

  const processLooseDataLines = () => {
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = buffer.slice(0, newlineIndex);
      const trimmed = line.trimStart();
      if (!trimmed) {
        buffer = buffer.slice(newlineIndex + 1);
        continue;
      }
      if (!trimmed.startsWith("data:")) {
        return;
      }
      const delta = payloadToDelta(trimmed.slice(5).replace(/^ /, ""));
      if (delta === null) {
        return;
      }
      appendDelta(delta);
      buffer = buffer.slice(newlineIndex + 1);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    processCompleteEvents();
    processLooseDataLines();
  }

  processCompleteEvents();
  if (buffer.trim()) {
    processEventBlock(buffer);
  }
  return result.trim();
}

function buildRequestBody(
  settings: FlashcardsSettings,
  prompt: string,
  cleanedText: string,
  mode: CardMode,
  stream: boolean
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: cleanedText }
    ],
    stream,
    temperature: mode === "qa" ? 0.3 : 0.4
  };
  if (!settings.model.startsWith("o")) {
    requestBody.max_tokens = settings.maxTokens;
  } else {
    requestBody.max_completion_tokens = settings.maxTokens;
    requestBody.reasoning_effort = settings.reasoningEffort || "low";
  }
  return requestBody;
}

export function renderCards(cards: string[]): string {
  return cards.map((card) => `<!-- CARD -->\n${card.trim()}`).join("\n\n");
}

export async function generateFlashcards(
  text: string,
  settings: FlashcardsSettings,
  mode: CardMode
): Promise<GeneratedFlashcards> {
  const result = await generateFlashcardsWithProgress(text, settings, mode);
  return result.cards;
}

export async function generateFlashcardsWithProgress(
  text: string,
  settings: FlashcardsSettings,
  mode: CardMode,
  progress: FlashcardsGenerationProgress = {}
): Promise<FlashcardsGenerationResult> {
  const cleanedText = stripExistingCards(text).replace(/<!--.*?-->/gs, "").trim();
  const prompt = buildPrompt(
    mode,
    settings.flashcardsCount,
    settings.systemPrompt || "",
    settings.additionalPrompt || ""
  );
  const url = buildUrl(settings.baseUrl || "https://api.openai.com", settings.apiPath || "/v1/chat/completions");
  const headers = buildHeaders(settings);
  const response = await postJson(
    url,
    headers,
    buildRequestBody(settings, prompt, cleanedText, mode, settings.streaming),
    progress.signal
  );
  let raw = settings.streaming ? await readStreamResponse(response, progress.onDelta) : await readJsonResponse(response);

  if (!raw.trim() && settings.streaming) {
    progress.onRetry?.();
    const retryResponse = await postJson(
      url,
      headers,
      buildRequestBody(settings, prompt, cleanedText, mode, false),
      progress.signal
    );
    raw = await readJsonResponse(retryResponse);
    if (raw.trim()) {
      progress.onDelta?.(raw);
    }
  }

  const parsed = parseCards(raw);
  const cards = parsed.length ? improveCardQuality(parsed, cleanedText, mode) : [buildFallbackCard(cleanedText, mode)];
  return { cards, raw };
}

export async function generateTwoSidedKnowledgeCard(
  text: string,
  settings: FlashcardsSettings,
  progress: FlashcardsGenerationProgress = {}
): Promise<string> {
  const cleanedText = cleanSourceTextForCard(stripExistingCards(text).replace(/<!--.*?-->/gs, ""));
  const prompt = buildTwoSidedKnowledgePrompt(settings.additionalPrompt || "");
  const url = buildUrl(settings.baseUrl || "https://api.openai.com", settings.apiPath || "/v1/chat/completions");
  const headers = buildHeaders(settings);
  const response = await postJson(
    url,
    headers,
    buildRequestBody(settings, prompt, normalizeSourceText(cleanedText), "knowledge", false),
    progress.signal
  );
  const raw = await readJsonResponse(response);
  const front = cleanupSingleLine(raw);

  if (!front || isLowQualityQuestionText(front, cleanedText)) {
    return buildTwoSidedKnowledgeFallback(cleanedText);
  }

  return [
    "START",
    "Basic",
    `Q: ${front}`,
    `A: ${formatOriginalTextForAnswer(cleanedText)}`,
    "END"
  ].join("\n");
}
