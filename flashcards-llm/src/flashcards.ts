import { FlashcardsSettings } from "./settings";

export type CardMode = "qa" | "knowledge";
export type GeneratedFlashcards = string[];

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
      "每个问题只考察一个记忆点，问题和答案都使用中文，答案保持简洁准确。"
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
    "知识点要原子化，避免把多个无关事实塞进同一张卡。"
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
    ...buildModeInstructions(mode)
  ];
  let prompt = promptParts.join("\n");
  if (additionalPrompt.trim()) {
    prompt += `\n额外要求：\n${additionalPrompt.trim()}`;
  }
  return prompt;
}

function parseCards(raw: string): string[] {
  return raw
    .split(/<!-- CARD -->/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((card) => card.replace(/^```[\w-]*\n?/m, "").replace(/\n?```$/m, "").trim());
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`请求失败：${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`);
  }
  return response;
}

async function readJsonResponse(response: Response): Promise<string> {
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim?.() ?? "";
}

async function readStreamResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let result = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        result += json?.choices?.[0]?.delta?.content ?? "";
      } catch {
        continue;
      }
    }
  }
  return result.trim();
}

export function renderCards(cards: string[]): string {
  return cards.map((card) => `<!-- CARD -->\n${card.trim()}`).join("\n\n");
}

export async function generateFlashcards(
  text: string,
  settings: FlashcardsSettings,
  mode: CardMode
): Promise<GeneratedFlashcards> {
  const cleanedText = stripExistingCards(text.replace(/<!--.*?-->/gs, ""));
  const prompt = buildPrompt(
    mode,
    settings.flashcardsCount,
    settings.systemPrompt || "",
    settings.additionalPrompt || ""
  );
  const url = buildUrl(settings.baseUrl || "https://api.openai.com", settings.apiPath || "/v1/chat/completions");
  const headers = buildHeaders(settings);
  const requestBody: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: cleanedText }
    ],
    stream: settings.streaming,
    temperature: mode === "qa" ? 0.3 : 0.4
  };
  if (!settings.model.startsWith("o")) {
    requestBody.max_tokens = settings.maxTokens;
  } else {
    requestBody.max_completion_tokens = settings.maxTokens;
    requestBody.reasoning_effort = settings.reasoningEffort || "low";
  }
  const response = await postJson(url, headers, requestBody);
  const raw = settings.streaming ? await readStreamResponse(response) : await readJsonResponse(response);
  const parsed = parseCards(raw);
  return parsed.length ? parsed : [raw.trim()].filter(Boolean);
}
