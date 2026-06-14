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
    "即使材料很短，也必须至少生成 1 张卡片，不能返回空内容。"
  ];
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

function buildFallbackCard(source: string, mode: CardMode): string {
  const compactSource = source
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

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
    "Q: 这段内容的核心知识点是什么？",
    `A: ${compactSource}`,
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
  const cleanedText = stripExistingCards(text.replace(/<!--.*?-->/gs, ""));
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
  const cards = parsed.length ? parsed : [buildFallbackCard(cleanedText, mode)];
  return { cards, raw };
}
