import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { generateFlashcards, CardMode } from "./flashcards";
import { GenerateModeModal, PreviewModal, InsertMode } from "./components";
import { FlashcardsSettings, FlashcardsSettingsTab } from "./settings";

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
  outputMode: "obsidian_to_anki"
};

export default class FlashcardsLLMPlugin extends Plugin {
  settings: FlashcardsSettings;
  private floatingBarEl: HTMLDivElement | null = null;
  private activeEditor: Editor | null = null;
  private activeView: MarkdownView | null = null;

  async onload() {
    await this.loadSettings();

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

      bar.appendChild(qaButton);
      bar.appendChild(knowledgeButton);
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
    await this.generateAndPreview(editor, this.settings, mode, this.getSourceText(editor));
  }

  private openGenerationFlow(editor: Editor, view: MarkdownView, mode: CardMode) {
    new GenerateModeModal(this.app, this, async ({ configuration, mode: selectedMode }) => {
      const sourceText = this.getSourceText(editor);
      await this.generateAndPreview(editor, configuration, selectedMode, sourceText);
    }, mode).open();
  }

  private async generateAndPreview(
    editor: Editor,
    configuration: FlashcardsSettings,
    mode: CardMode,
    sourceText: string
  ) {
    if (!configuration.apiKey) {
      new Notice("请先在插件设置中填写 API Key");
      return;
    }
    if (!configuration.model) {
      new Notice("请先在插件设置中填写模型名称");
      return;
    }

    let flashcardsCount = Math.trunc(configuration.flashcardsCount);
    if (!Number.isFinite(flashcardsCount) || flashcardsCount <= 0) {
      flashcardsCount = 3;
    }

    let maxTokens = Math.trunc(configuration.maxTokens);
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
      maxTokens = 300;
    }

    new Notice("正在生成卡片...");
    try {
      const effectiveConfig: FlashcardsSettings = {
        ...configuration,
        flashcardsCount,
        maxTokens
      };
      const cards = await generateFlashcards(sourceText, effectiveConfig, mode);
      const preview = new PreviewModal(this.app, cards, editor.somethingSelected(), async (result) => {
        this.insertCards(editor, result.text, result.insertMode);
      });
      preview.open();
    } catch (error) {
      console.error("生成卡片失败：", error);
      new Notice("生成卡片失败，请查看插件控制台详情");
    }
  }

  private insertCards(editor: Editor, text: string, insertMode: InsertMode) {
    if (!text.trim()) {
      new Notice("没有可插入的卡片");
      return;
    }
    if (insertMode === "replace-selection" && editor.somethingSelected()) {
      editor.replaceSelection(`\n\n${text}\n`);
    } else {
      editor.setCursor(editor.lastLine());
      editor.replaceRange(`\n\n${text}\n`, editor.getCursor());
    }
    new Notice("卡片已插入");
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
