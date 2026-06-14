import { Editor, MarkdownView, Notice, normalizePath, Plugin, TFile, TFolder } from "obsidian";
import {
  buildSourceHash,
  CardMode,
  cleanSourceTextForCard,
  generateFlashcardsWithProgress,
  generateTwoSidedKnowledgeCard,
  renderCards
} from "./flashcards";
import { AnkiReviewModal, GenerateModeModal, PreviewModal } from "./components";
import { FlashcardsSettings, FlashcardsSettingsTab } from "./settings";
import {
  buildDeckSearchQuery,
  buildAnkiNotes,
  createAnkiClient,
  parseGeneratedCards,
  resolveAnkiDeckName,
  summarizeAddNotesResult
} from "./anki";
import type { AnkiCardInfo, ImportSummary } from "./anki";

interface MarkedKeyPoint {
  markerId: string;
  sourceHash: string;
  text: string;
  index: number;
}

const KEY_POINT_INLINE_MARKER_PATTERN = /%%\s*flashcards-llm-key-point:id=([^\s%]+)\s*%%/i;
const KEY_POINT_BLOCK_START_PATTERN = /^\s*%%\s*flashcards-llm-key-point:start\s+id=([^\s%]+)\s*%%\s*$/i;

const DEFAULT_SETTINGS: FlashcardsSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com",
  apiPath: "/v1/chat/completions",
  authHeader: "Authorization",
  authPrefix: "Bearer ",
  extraHeadersJson: "",
  model: "gpt-4o",
  inlineSeparator: "::",
  multilineSeparator: "?",
  flashcardsCount: 3,
  additionalPrompt: "",
  systemPrompt: "",
  maxTokens: 300,
  reasoningEffort: "low",
  streaming: true,
  hideInPreview: true,
  tag: "#flashcards",
  outputMode: "obsidian_to_anki",
  ankiConnectUrl: "http://127.0.0.1:8765",
  ankiApiKey: "",
  ankiDeck: "系统默认",
  ankiDeckMode: "source_file",
  ankiTags: "Obsidian_to_Anki flashcards_llm",
  autoImportToAnki: true,
  createMissingDeck: true,
  ankiReviewLimit: 20,
  ankiBasicModel: "Basic",
  ankiBasicFrontField: "Front",
  ankiBasicBackField: "Back",
  ankiClozeModel: "填空题",
  ankiClozeTextField: "文字",
  ankiClozeExtraField: "背面额外"
};

export default class FlashcardsLLMPlugin extends Plugin {
  settings: FlashcardsSettings;
  private floatingBarEl: HTMLDivElement | null = null;
  private activeEditor: Editor | null = null;
  private activeView: MarkdownView | null = null;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("repeat", "复习当前笔记牌组", async () => {
      await this.openAnkiReviewForActiveDeck();
    }).addClass("flashcards-llm-review-ribbon");

    this.addCommand({
      id: "generate-qa-flashcards",
      name: "生成问答卡片",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.openGenerationFlow(editor, view, "qa");
      }
    });

    this.addCommand({
      id: "generate-knowledge-flashcards",
      name: "生成知识点卡片",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.openGenerationFlow(editor, view, "knowledge");
      }
    });

    this.addCommand({
      id: "mark-selection-as-key-point",
      name: "把选中文本划为重点",
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "H" }],
      editorCallback: (editor: Editor) => {
        this.markSelectionAsKeyPoint(editor);
      }
    });

    this.addCommand({
      id: "migrate-legacy-key-point-markers",
      name: "修复旧版重点标记为安全格式",
      editorCallback: (editor: Editor) => {
        this.migrateLegacyKeyPointMarkers(editor);
      }
    });

    this.addCommand({
      id: "batch-generate-key-point-qa-flashcards",
      name: "批量生成重点问答卡片",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.batchGenerateKeyPointCards(editor, view, "qa");
      }
    });

    this.addCommand({
      id: "batch-generate-key-point-knowledge-flashcards",
      name: "批量生成重点知识点卡片（背面原话）",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.batchGenerateKeyPointCards(editor, view, "knowledge");
      }
    });

    this.addCommand({
      id: "import-current-note-card-folder-to-anki",
      name: "导入当前笔记卡片文件夹到 Anki",
      callback: async () => {
        await this.importCurrentNoteCardsToAnki();
      }
    });

    this.addCommand({
      id: "test-anki-connect",
      name: "测试 AnkiConnect 连接",
      callback: async () => {
        await this.testAnkiConnection();
      }
    });

    this.addCommand({
      id: "review-current-note-anki-deck",
      name: "在 Obsidian 中复习当前笔记牌组",
      callback: async () => {
        await this.openAnkiReviewForActiveDeck();
      }
    });

    this.addSettingTab(new FlashcardsSettingsTab(this.app, this));

    this.registerDomEvent(document, "selectionchange", () => {
      this.handleSelectionChange();
    });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.hideFloatingBar();
      this.handleSelectionChange();
    }));

    this.registerDomEvent(window, "scroll", () => {
      this.handleSelectionChange();
    }, true);
  }

  async testAnkiConnection(): Promise<void> {
    try {
      const client = createAnkiClient(this.settings);
      const [version, decks, models] = await Promise.all([
        client.version(),
        client.deckNames(),
        client.modelNames()
      ]);
      new Notice(`Anki 连接正常：AnkiConnect v${version}，${decks.length} 个牌组，${models.length} 个模板`);
    } catch (error) {
      console.error("测试 AnkiConnect 连接失败：", error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Anki 连接失败：${message}`);
    }
  }

  async runBatchGenerateFromActiveView(mode: CardMode): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !(view.file instanceof TFile)) {
      new Notice("请先打开一个 Markdown 笔记再执行批量生成");
      return;
    }
    await this.batchGenerateKeyPointCards(view.editor, view, mode);
  }

  async importCurrentNoteCardsToAnki(): Promise<ImportSummary | null> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !(view.file instanceof TFile)) {
      new Notice("请先打开一个 Markdown 笔记再导入卡片文件夹");
      return null;
    }
    return this.importCardFolderToAnki(view.file);
  }

  async openAnkiReviewForActiveDeck(): Promise<void> {
    const sourceFile = this.getActiveSourceFile();
    if ((this.settings.ankiDeckMode || "source_file") === "source_file" && !sourceFile) {
      new Notice("请先打开一个 Markdown 笔记，再复习当前笔记同名牌组");
      return;
    }

    const deckName = resolveAnkiDeckName(this.settings, sourceFile);
    try {
      const cards = await this.loadAnkiReviewCards(deckName);
      new AnkiReviewModal(this.app, {
        deckName,
        cards,
        onAnswer: async (card, ease) => this.answerAnkiCard(card, ease),
        onReload: async () => this.loadAnkiReviewCards(deckName)
      }).open();
    } catch (error) {
      console.error("打开 Obsidian 内 Anki 复习失败：", error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`打开 Anki 复习失败：${message}`);
    }
  }

  private getActiveSourceFile(): TFile | undefined {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file instanceof TFile ? view.file : undefined;
  }

  private async loadAnkiReviewCards(deckName: string): Promise<AnkiCardInfo[]> {
    const client = createAnkiClient(this.settings);
    const dueIds = await client.findCards(buildDeckSearchQuery(deckName, "is:due -is:suspended"));
    const newIds = await client.findCards(buildDeckSearchQuery(deckName, "is:new -is:suspended"));
    const ids = Array.from(new Set([...dueIds, ...newIds])).slice(0, this.getAnkiReviewLimit());
    if (!ids.length) {
      return [];
    }
    return (await client.cardsInfo(ids)).filter((card) => typeof card.cardId === "number");
  }

  private async answerAnkiCard(card: AnkiCardInfo, ease: number): Promise<boolean> {
    const result = await createAnkiClient(this.settings).answerCards([{ cardId: card.cardId, ease }]);
    return result[0] === true;
  }

  private getAnkiReviewLimit(): number {
    const limit = Math.trunc(this.settings.ankiReviewLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      return 20;
    }
    return Math.min(limit, 200);
  }

  private getSourceText(editor: Editor): string {
    if (editor.somethingSelected()) {
      return editor.getSelection();
    }
    const wholeText = editor.getValue();
    const highlights = wholeText.match(/==([\s\S]+?)==/g);
    if (highlights && highlights.length) {
      return highlights.map((item) => item.replace(/^==|==$/g, "")).join("\n");
    }
    return wholeText;
  }

  private getActiveMarkdownEditor(): Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== "source") {
      return null;
    }
    return view.editor;
  }

  private handleSelectionChange() {
    const editor = this.getActiveMarkdownEditor();
    const selection = editor?.somethingSelected() ? editor.getSelection().trim() : "";
    if (!editor || !selection) {
      this.hideFloatingBar();
      return;
    }
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      this.hideFloatingBar();
      return;
    }
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      this.hideFloatingBar();
      return;
    }
    this.activeEditor = editor;
    this.activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.showFloatingBar(rect);
  }

  private showFloatingBar(rect: DOMRect) {
    if (!this.floatingBarEl) {
      const bar = document.createElement("div");
      bar.addClass("flashcards-llm-floating-bar");

      const qaButton = document.createElement("button");
      qaButton.type = "button";
      qaButton.textContent = "问答卡";
      qaButton.onmousedown = (evt) => evt.preventDefault();
      qaButton.onclick = () => this.quickGenerate("qa");

      const knowledgeButton = document.createElement("button");
      knowledgeButton.type = "button";
      knowledgeButton.textContent = "知识点卡";
      knowledgeButton.onmousedown = (evt) => evt.preventDefault();
      knowledgeButton.onclick = () => this.quickGenerate("knowledge");

      const markButton = document.createElement("button");
      markButton.type = "button";
      markButton.textContent = "划重点";
      markButton.onmousedown = (evt) => evt.preventDefault();
      markButton.onclick = () => this.quickMarkKeyPoint();

      bar.appendChild(qaButton);
      bar.appendChild(knowledgeButton);
      bar.appendChild(markButton);
      document.body.appendChild(bar);
      this.floatingBarEl = bar;
    }

    const top = window.scrollY + rect.top - 44;
    const left = window.scrollX + rect.left + rect.width / 2;
    this.floatingBarEl.style.top = `${Math.max(8, top)}px`;
    this.floatingBarEl.style.left = `${Math.max(8, left)}px`;
  }

  private hideFloatingBar() {
    this.floatingBarEl?.remove();
    this.floatingBarEl = null;
  }

  private async quickGenerate(mode: CardMode) {
    const editor = this.activeEditor ?? this.getActiveMarkdownEditor();
    const view = this.activeView ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!editor || !view) {
      new Notice("没有可用的 Markdown 编辑器");
      return;
    }
    this.hideFloatingBar();
    await this.generateAndPreview(editor, view, this.settings, mode, this.getSourceText(editor));
  }

  private quickMarkKeyPoint() {
    const editor = this.activeEditor ?? this.getActiveMarkdownEditor();
    if (!editor) {
      new Notice("没有可用的 Markdown 编辑器");
      return;
    }
    this.markSelectionAsKeyPoint(editor);
    this.hideFloatingBar();
  }

  private openGenerationFlow(editor: Editor, view: MarkdownView, mode: CardMode) {
    new GenerateModeModal(this.app, this, async ({ configuration, mode: selectedMode }) => {
      const sourceText = this.getSourceText(editor);
      await this.generateAndPreview(editor, view, configuration, selectedMode, sourceText);
    }, mode).open();
  }

  private buildInlineKeyPointMarker(markerId: string): string {
    return `%% flashcards-llm-key-point:id=${markerId} %%`;
  }

  private buildBlockKeyPointStartMarker(markerId: string): string {
    return `%% flashcards-llm-key-point:start id=${markerId} %%`;
  }

  private buildBlockKeyPointEndMarker(): string {
    return "%% flashcards-llm-key-point:end %%";
  }

  private buildSafeKeyPointMarkup(body: string, markerId: string): string {
    const highlightedBody = this.highlightKeyPointMarkdown(body);
    if (body.includes("\n")) {
      return [
        this.buildBlockKeyPointStartMarker(markerId),
        highlightedBody,
        this.buildBlockKeyPointEndMarker()
      ].join("\n");
    }

    return `${highlightedBody} ${this.buildInlineKeyPointMarker(markerId)}`;
  }

  private highlightKeyPointMarkdown(text: string): string {
    const lines = text.split("\n");
    let inFence = false;

    return lines.map((line) => {
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !trimmed || line.includes("==")) {
        return line;
      }
      return this.highlightKeyPointLine(line);
    }).join("\n");
  }

  private highlightKeyPointLine(line: string): string {
    const structuralMatch = line.match(
      /^(\s*(?:(?:>\s*)+)?(?:(?:#{1,6}\s+)|(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?))?)(.*?)(\s*)$/
    );
    if (!structuralMatch) {
      return `==${line}==`;
    }

    const prefix = structuralMatch[1] ?? "";
    const content = structuralMatch[2] ?? "";
    const trailing = structuralMatch[3] ?? "";
    if (!content.trim()) {
      return line;
    }

    const contentMatch = content.match(/^(\s*)(.*?)(\s*)$/);
    const contentLeading = contentMatch?.[1] ?? "";
    const contentBody = contentMatch?.[2] ?? content;
    const contentTrailing = contentMatch?.[3] ?? "";
    return `${prefix}${contentLeading}==${contentBody}==${contentTrailing}${trailing}`;
  }

  private markSelectionAsKeyPoint(editor: Editor) {
    const selection = editor.getSelection();
    if (!selection.trim()) {
      new Notice("请先选中需要划重点的文本");
      return;
    }

    const match = selection.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const leading = match?.[1] ?? "";
    const body = match?.[2] ?? selection;
    const trailing = match?.[3] ?? "";

    if (!body.trim()) {
      new Notice("请先选中需要划重点的文本");
      return;
    }
    if (
      /data-flashcards-llm-key=["']/.test(body) ||
      KEY_POINT_INLINE_MARKER_PATTERN.test(body) ||
      body.split("\n").some((line) => KEY_POINT_BLOCK_START_PATTERN.test(line.trim()))
    ) {
      new Notice("这段内容已经是重点");
      return;
    }

    const sourceHash = buildSourceHash(body);
    editor.replaceSelection(`${leading}${this.buildSafeKeyPointMarkup(body, sourceHash)}${trailing}`);
    new Notice("已划重点，可使用批量命令生成卡片");
  }

  private migrateLegacyKeyPointMarkers(editor: Editor) {
    const text = editor.getValue();
    const legacyMarkerPattern = /<u\b(?=[^>]*data-flashcards-llm-key=["'][^"']+["'])[^>]*>([\s\S]*?)<\/u>/gi;
    let migratedCount = 0;

    const migrated = text.replace(legacyMarkerPattern, (fullMatch: string, rawBody: string) => {
      const markerId = fullMatch.match(/data-flashcards-llm-key=["']([^"']+)["']/i)?.[1] ?? buildSourceHash(rawBody);
      const match = rawBody.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const leading = match?.[1] ?? "";
      const body = match?.[2] ?? rawBody;
      const trailing = match?.[3] ?? "";
      if (!body.trim()) {
        return rawBody;
      }

      migratedCount += 1;
      return `${leading}${this.buildSafeKeyPointMarkup(body, markerId)}${trailing}`;
    });

    if (!migratedCount) {
      new Notice("没有找到需要修复的旧版重点标记");
      return;
    }

    editor.setValue(migrated);
    new Notice(`已修复 ${migratedCount} 个旧版重点标记`);
  }

  private getEffectiveConfig(configuration: FlashcardsSettings): FlashcardsSettings | null {
    if (!configuration.apiKey) {
      new Notice("请先在插件设置中填写 API Key");
      return null;
    }
    if (!configuration.model) {
      new Notice("请先在插件设置中填写模型名称");
      return null;
    }

    let flashcardsCount = Math.trunc(configuration.flashcardsCount);
    if (!Number.isFinite(flashcardsCount) || flashcardsCount <= 0) {
      flashcardsCount = 3;
    }

    let maxTokens = Math.trunc(configuration.maxTokens);
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
      maxTokens = 300;
    }

    return {
      ...configuration,
      flashcardsCount,
      maxTokens
    };
  }

  private extractMarkedKeyPoints(text: string): MarkedKeyPoint[] {
    const keyPoints: MarkedKeyPoint[] = [];
    let index = 0;

    const addKeyPoint = (markerId: string, rawText: string) => {
      const cleanedText = cleanSourceTextForCard(rawText);
      if (!cleanedText) {
        return;
      }
      keyPoints.push({
        markerId,
        sourceHash: buildSourceHash(cleanedText),
        text: cleanedText,
        index
      });
      index += 1;
    };

    const blockPattern = /^\s*%%\s*flashcards-llm-key-point:start\s+id=([^\s%]+)\s*%%\s*$(\r?\n)([\s\S]*?)\2\s*%%\s*flashcards-llm-key-point:end\s*%%\s*$/gim;
    const textWithoutBlocks = text.replace(blockPattern, (_full, markerId: string, _newline: string, body: string) => {
      addKeyPoint(markerId, body);
      return "\n";
    });

    const inlinePattern = /==([^\n]*?)==\s*%%\s*flashcards-llm-key-point:id=([^\s%]+)\s*%%/gi;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlinePattern.exec(textWithoutBlocks)) !== null) {
      addKeyPoint(inlineMatch[2], inlineMatch[1]);
    }

    const legacyMarkerPattern = /<u\b(?=[^>]*data-flashcards-llm-key=["'][^"']+["'])[^>]*>([\s\S]*?)<\/u>/gi;
    let match: RegExpExecArray | null;
    while ((match = legacyMarkerPattern.exec(textWithoutBlocks)) !== null) {
      const marker = match[0];
      const markerId = marker.match(/data-flashcards-llm-key=["']([^"']+)["']/i)?.[1] ?? "";
      addKeyPoint(markerId, match[1]);
    }

    return keyPoints;
  }

  private async batchGenerateKeyPointCards(editor: Editor, view: MarkdownView, mode: CardMode) {
    const effectiveConfig = this.getEffectiveConfig({
      ...this.settings,
      flashcardsCount: 1,
      streaming: false
    });
    if (!effectiveConfig) {
      return;
    }

    const file = view.file;
    if (!(file instanceof TFile)) {
      new Notice("没有找到当前笔记文件，无法批量生成卡片");
      return;
    }

    const keyPoints = this.extractMarkedKeyPoints(editor.getValue());
    if (!keyPoints.length) {
      new Notice("当前笔记没有找到由本插件划出的重点");
      return;
    }

    const folderPath = await this.ensureCardFolder(file);
    const existingHashes = await this.getExistingSourceHashes(folderPath);
    const seenInThisRun = new Set<string>();
    const pending = keyPoints.filter((keyPoint) => {
      if (seenInThisRun.has(keyPoint.sourceHash) || existingHashes.has(keyPoint.sourceHash)) {
        return false;
      }
      seenInThisRun.add(keyPoint.sourceHash);
      return true;
    });

    if (!pending.length) {
      new Notice(`找到 ${keyPoints.length} 段重点，但都已生成过卡片，本次无需处理`);
      return;
    }

    new Notice(`找到 ${keyPoints.length} 段重点，本次将生成 ${pending.length} 张新卡片`);
    let successCount = 0;
    let failCount = 0;
    const generatedCards: string[] = [];

    for (const keyPoint of pending) {
      try {
        const card = await this.generateCardForKeyPoint(keyPoint, effectiveConfig, mode);
        await this.saveKeyPointCardFile(file, card, mode, keyPoint);
        generatedCards.push(card);
        successCount += 1;
      } catch (error) {
        failCount += 1;
        console.error("批量生成重点卡片失败：", keyPoint, error);
      }
    }

    if (successCount > 0) {
      new Notice(`批量生成完成：新增 ${successCount} 张，失败 ${failCount} 张，已跳过重复重点`);
      if (this.settings.autoImportToAnki) {
        await this.importCardsTextToAnki(renderCards(generatedCards), file);
      }
      return;
    }

    new Notice("批量生成失败，请查看插件控制台详情");
  }

  private async generateCardForKeyPoint(
    keyPoint: MarkedKeyPoint,
    configuration: FlashcardsSettings,
    mode: CardMode
  ): Promise<string> {
    if (mode === "knowledge") {
      return generateTwoSidedKnowledgeCard(keyPoint.text, configuration);
    }

    const result = await generateFlashcardsWithProgress(keyPoint.text, configuration, "qa");
    return result.cards[0];
  }

  private async generateAndPreview(
    editor: Editor,
    view: MarkdownView,
    configuration: FlashcardsSettings,
    mode: CardMode,
    sourceText: string
  ) {
    const effectiveConfig = this.getEffectiveConfig(configuration);
    if (!effectiveConfig) {
      return;
    }
    const abortController = new AbortController();
    const preview = new PreviewModal(this.app, "", async (result) => {
      await this.saveCardsAndSync(view, result.text, mode);
    }, {
      generating: true,
      onCancel: () => abortController.abort()
    });
    preview.open();
    preview.setStatus(effectiveConfig.streaming ? "正在连接模型并准备流式生成..." : "正在等待模型完整响应...");
    new Notice("正在生成卡片...");

    try {
      const result = await generateFlashcardsWithProgress(sourceText, effectiveConfig, mode, {
        signal: abortController.signal,
        onDelta: (delta) => {
          preview.appendText(delta);
        },
        onRetry: () => {
          preview.setText("");
          preview.setStatus("流式响应为空，正在自动切换为非流式请求重试...");
        }
      });

      preview.setText(renderCards(result.cards));
      preview.setGenerating(false);
      preview.setStatus("生成完成，可编辑后确认保存并同步。");
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      preview.setError("生成失败，请检查 API 配置或打开开发者控制台查看详情。");
      console.error("生成卡片失败：", error);
      new Notice("生成卡片失败，请查看插件控制台详情");
    }
  }

  private async saveCardsAndSync(view: MarkdownView, text: string, mode: CardMode) {
    if (!text.trim()) {
      new Notice("没有可保存的卡片");
      return;
    }
    const file = view.file;
    if (!(file instanceof TFile)) {
      new Notice("没有找到当前笔记文件，无法创建卡片文件夹");
      return;
    }

    try {
      const savedPath = await this.saveCardsToSiblingFolder(file, text, mode);
      new Notice(`卡片已保存到 ${savedPath}`);
      if (this.settings.autoImportToAnki) {
        await this.importCardsTextToAnki(text, file);
      } else {
        new Notice("已关闭自动导入，可稍后使用“导入当前笔记卡片文件夹到 Anki”");
      }
    } catch (error) {
      console.error("保存卡片或同步 Anki 失败：", error);
      new Notice("保存卡片或同步 Anki 失败，请查看插件控制台详情");
    }
  }

  private async saveCardsToSiblingFolder(file: TFile, text: string, mode: CardMode): Promise<string> {
    const folderPath = await this.ensureCardFolder(file);
    const timestamp = this.formatTimestamp(new Date());
    const modeLabel = mode === "qa" ? "问答卡" : "知识点卡";
    const cardPath = await this.getUniqueCardPath(folderPath, `${file.basename}-card-${timestamp}.md`);
    const content = [
      "---",
      `source: "[[${file.basename}]]"`,
      `source_path: "${file.path}"`,
      `created: "${new Date().toISOString()}"`,
      `mode: "${mode}"`,
      "generator: \"闪卡 LLM（自改中文版）\"",
      "---",
      "",
      `# ${file.basename} - ${modeLabel}`,
      "",
      text.trim(),
      ""
    ].join("\n");

    await this.app.vault.create(cardPath, content);
    return cardPath;
  }

  private getCardFolderPath(file: TFile): string {
    const parentPath = file.parent?.path ?? "";
    const folderName = `${file.basename}-card`;
    return normalizePath(parentPath ? `${parentPath}/${folderName}` : folderName);
  }

  private async ensureCardFolder(file: TFile): Promise<string> {
    const folderPath = this.getCardFolderPath(file);
    const existingFolder = this.app.vault.getFolderByPath(folderPath);
    const existingAbstractFile = this.app.vault.getAbstractFileByPath(folderPath);

    if (!existingFolder) {
      if (existingAbstractFile) {
        throw new Error(`同名路径已存在但不是文件夹：${folderPath}`);
      }
      await this.app.vault.createFolder(folderPath);
    }

    return folderPath;
  }

  private async getExistingSourceHashes(folderPath: string): Promise<Set<string>> {
    const hashes = new Set<string>();
    const folder = this.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      return hashes;
    }

    const files = this.getMarkdownFilesInFolder(folder);
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const matches = content.matchAll(/^source_hash:\s*["']?([^"'\s]+)["']?\s*$/gm);
      for (const match of matches) {
        hashes.add(match[1]);
      }
    }

    return hashes;
  }

  private getMarkdownFilesInFolder(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        files.push(child);
      } else if (child instanceof TFolder) {
        files.push(...this.getMarkdownFilesInFolder(child));
      }
    }
    return files;
  }

  private async saveKeyPointCardFile(
    file: TFile,
    card: string,
    mode: CardMode,
    keyPoint: MarkedKeyPoint
  ): Promise<string> {
    const folderPath = await this.ensureCardFolder(file);
    const modeLabel = mode === "qa" ? "问答卡" : "知识点卡";
    const cardPath = await this.getUniqueCardPath(folderPath, `${file.basename}-key-${keyPoint.sourceHash}.md`);
    const content = [
      "---",
      `source: "[[${file.basename}]]"`,
      `source_path: "${file.path}"`,
      `source_hash: "${keyPoint.sourceHash}"`,
      `key_marker_id: "${keyPoint.markerId}"`,
      `key_index: ${keyPoint.index}`,
      `created: "${new Date().toISOString()}"`,
      `mode: "batch-${mode}"`,
      "generator: \"闪卡 LLM（自改中文版）\"",
      "---",
      "",
      `# ${file.basename} - 重点${modeLabel}`,
      "",
      renderCards([card]),
      ""
    ].join("\n");

    await this.app.vault.create(cardPath, content);
    return cardPath;
  }

  private async getUniqueCardPath(folderPath: string, fileName: string): Promise<string> {
    const extensionIndex = fileName.lastIndexOf(".");
    const stem = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
    const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
    let candidate = normalizePath(`${folderPath}/${fileName}`);
    let index = 2;

    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folderPath}/${stem}-${index}${extension}`);
      index += 1;
    }

    return candidate;
  }

  private formatTimestamp(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join("") + "-" + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
  }

  private async importCardFolderToAnki(file: TFile): Promise<ImportSummary | null> {
    const folderPath = this.getCardFolderPath(file);
    const folder = this.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      new Notice(`没有找到卡片文件夹：${folderPath}`);
      return null;
    }

    const files = this.getMarkdownFilesInFolder(folder)
      .sort((a, b) => a.path.localeCompare(b.path));
    if (!files.length) {
      new Notice(`卡片文件夹为空：${folderPath}`);
      return null;
    }

    const contents: string[] = [];
    for (const cardFile of files) {
      contents.push(await this.app.vault.cachedRead(cardFile));
    }

    return this.importCardsTextToAnki(contents.join("\n\n"), file);
  }

  private async importCardsTextToAnki(text: string, sourceFile?: TFile): Promise<ImportSummary | null> {
    const cards = parseGeneratedCards(text);
    if (!cards.length) {
      new Notice("没有解析到可导入 Anki 的卡片，请检查 START/Basic 或 START/Cloze 格式");
      return null;
    }

    try {
      const deckName = resolveAnkiDeckName(this.settings, sourceFile);
      const client = createAnkiClient(this.settings);
      if (this.settings.createMissingDeck) {
        await client.createDeck(deckName);
      }

      const notes = buildAnkiNotes(cards, this.settings, sourceFile);
      const result = await client.addNotes(notes);
      const summary = summarizeAddNotesResult(result, notes.length);
      new Notice(
        `Anki 导入完成：已导入到「${deckName}」，解析 ${summary.total} 张，新增 ${summary.added} 张，重复/跳过 ${summary.duplicateOrSkipped} 张`
      );
      return summary;
    } catch (error) {
      console.error("Anki 直连导入失败：", error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Anki 直连导入失败：${message}`);
      return null;
    }
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
