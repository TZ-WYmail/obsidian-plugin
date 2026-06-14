import { requestUrl } from "obsidian";
import type { TFile } from "obsidian";
import type { FlashcardsSettings } from "./settings";

export interface AnkiConnectResponse<T> {
  result: T;
  error: string | null;
}

export interface ParsedAnkiCard {
  type: "basic" | "cloze";
  front?: string;
  back?: string;
  cloze?: string;
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  options: {
    allowDuplicate: boolean;
    duplicateScope: "deck" | "collection";
    duplicateScopeOptions?: {
      deckName: string;
      checkChildren: boolean;
      checkAllModels: boolean;
    };
  };
  tags: string[];
}

export interface ImportSummary {
  total: number;
  added: number;
  duplicateOrSkipped: number;
  failed: number;
}

export class AnkiConnectClient {
  constructor(private readonly url: string, private readonly apiKey: string) {}

  async request<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    const body: Record<string, unknown> = {
      action,
      version: 6
    };
    if (params) {
      body.params = params;
    }
    if (this.apiKey.trim()) {
      body.key = this.apiKey.trim();
    }

    const response = await requestUrl({
      url: this.url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body)
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`AnkiConnect 请求失败：HTTP ${response.status}`);
    }

    const data = response.json as AnkiConnectResponse<T>;
    if (data.error) {
      throw new Error(data.error);
    }
    return data.result;
  }

  version(): Promise<number> {
    return this.request<number>("version");
  }

  deckNames(): Promise<string[]> {
    return this.request<string[]>("deckNames");
  }

  modelNames(): Promise<string[]> {
    return this.request<string[]>("modelNames");
  }

  createDeck(deck: string): Promise<number> {
    return this.request<number>("createDeck", { deck });
  }

  addNotes(notes: AnkiNote[]): Promise<Array<number | null>> {
    return this.request<Array<number | null>>("addNotes", { notes });
  }
}

export function createAnkiClient(settings: FlashcardsSettings): AnkiConnectClient {
  return new AnkiConnectClient(settings.ankiConnectUrl || "http://127.0.0.1:8765", settings.ankiApiKey || "");
}

export function resolveAnkiDeckName(settings: FlashcardsSettings, sourceFile?: TFile): string {
  if ((settings.ankiDeckMode || "source_file") === "source_file" && sourceFile?.basename.trim()) {
    return sanitizeAnkiDeckName(sourceFile.basename);
  }
  return sanitizeAnkiDeckName(settings.ankiDeck || "系统默认");
}

export function parseGeneratedCards(text: string): ParsedAnkiCard[] {
  const cleaned = text
    .replace(/^---\s*[\s\S]*?\n---\s*/m, "")
    .replace(/^# .*$\n?/gm, "");
  const blocks = cleaned.includes("<!-- CARD -->")
    ? cleaned.split(/<!-- CARD -->/g).slice(1)
    : Array.from(cleaned.matchAll(/START\s*\n[\s\S]*?\nEND/gi)).map((match) => match[0]);
  const cards: ParsedAnkiCard[] = [];

  for (const block of blocks) {
    const cardMatches = Array.from(block.matchAll(/START\s*\n([\s\S]*?)\nEND/gi));

    for (const match of cardMatches) {
      const body = match[1].trim();
      const lines = body.split(/\r?\n/);
      const noteType = (lines.shift() ?? "").trim().toLowerCase();
      const fieldsText = lines.join("\n").trim();

      if (noteType.includes("cloze")) {
        if (fieldsText.includes("{{c")) {
          cards.push({ type: "cloze", cloze: fieldsText });
        }
        continue;
      }

      const qa = fieldsText.match(/^Q:\s*([\s\S]*?)\nA:\s*([\s\S]*)$/i);
      if (qa) {
        cards.push({
          type: "basic",
          front: qa[1].trim(),
          back: qa[2].trim()
        });
      }
    }
  }

  return cards;
}

export function buildAnkiNotes(cards: ParsedAnkiCard[], settings: FlashcardsSettings, sourceFile?: TFile): AnkiNote[] {
  const deckName = resolveAnkiDeckName(settings, sourceFile);
  const tags = buildTags(settings, sourceFile);

  return cards.map((card) => {
    const common = {
      deckName,
      options: {
        allowDuplicate: false,
        duplicateScope: "deck" as const,
        duplicateScopeOptions: {
          deckName,
          checkChildren: true,
          checkAllModels: false
        }
      },
      tags
    };

    if (card.type === "cloze") {
      return {
        ...common,
        modelName: settings.ankiClozeModel || "填空题",
        fields: {
          [settings.ankiClozeTextField || "文字"]: formatAnkiField(card.cloze ?? ""),
          [settings.ankiClozeExtraField || "背面额外"]: sourceFile ? formatAnkiField(`来源：[[${sourceFile.basename}]]`) : ""
        }
      };
    }

    return {
      ...common,
      modelName: settings.ankiBasicModel || "Basic",
      fields: {
        [settings.ankiBasicFrontField || "Front"]: formatAnkiField(card.front ?? ""),
        [settings.ankiBasicBackField || "Back"]: formatAnkiField(card.back ?? "")
      }
    };
  });
}

export function summarizeAddNotesResult(result: Array<number | null>, total: number): ImportSummary {
  const added = result.filter((id) => typeof id === "number").length;
  return {
    total,
    added,
    duplicateOrSkipped: total - added,
    failed: 0
  };
}

function buildTags(settings: FlashcardsSettings, sourceFile?: TFile): string[] {
  const rawTags = (settings.ankiTags || "Obsidian_to_Anki flashcards_llm")
    .split(/[\s,]+/g)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
  if (sourceFile) {
    rawTags.push("obsidian");
  }
  return Array.from(new Set(rawTags));
}

function formatAnkiField(text: string): string {
  return text
    .trim()
    .replace(/<!-- CARD -->/g, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, "$2")
    .replace(/\[\[([^\]]+)]]/g, "$1")
    .replace(/==([\s\S]*?)==/g, "<mark>$1</mark>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function sanitizeAnkiDeckName(name: string): string {
  return name
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "系统默认";
}
