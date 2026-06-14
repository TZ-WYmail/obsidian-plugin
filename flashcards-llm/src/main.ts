import { Editor, MarkdownView, Notice, normalizePath, Plugin, TFile } from "obsidian";
import { CardMode, generateFlashcardsWithProgress, renderCards } from "./flashcards";
import { GenerateModeModal, PreviewModal } from "./components";
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
    await this.generateAndPreview(editor, view, this.settings, mode, this.getSourceText(editor));
  }

  private openGenerationFlow(editor: Editor, view: MarkdownView, mode: CardMode) {
    new GenerateModeModal(this.app, this, async ({ configuration, mode: selectedMode }) => {
      const sourceText = this.getSourceText(editor);
      await this.generateAndPreview(editor, view, configuration, selectedMode, sourceText);
    }, mode).open();
  }

  private async generateAndPreview(
    editor: Editor,
    view: MarkdownView,
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

    const effectiveConfig: FlashcardsSettings = {
      ...configuration,
      flashcardsCount,
      maxTokens
    };
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
      await this.trySyncToAnki();
    } catch (error) {
      console.error("保存卡片或同步 Anki 失败：", error);
      new Notice("保存卡片或同步 Anki 失败，请查看插件控制台详情");
    }
  }

  private async saveCardsToSiblingFolder(file: TFile, text: string, mode: CardMode): Promise<string> {
    const parentPath = file.parent?.path ?? "";
    const folderName = `${file.basename}-card`;
    const folderPath = normalizePath(parentPath ? `${parentPath}/${folderName}` : folderName);
    const existingFolder = this.app.vault.getFolderByPath(folderPath);
    const existingAbstractFile = this.app.vault.getAbstractFileByPath(folderPath);

    if (!existingFolder) {
      if (existingAbstractFile) {
        throw new Error(`同名路径已存在但不是文件夹：${folderPath}`);
      }
      await this.app.vault.createFolder(folderPath);
    }

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

  private async trySyncToAnki() {
    const commandIds = [
      "obsidian-to-anki-plugin:anki-scan-vault",
      "obsidian-to-anki:anki-scan-vault"
    ];
    const commands = (this.app as unknown as {
      commands?: {
        executeCommandById?: (commandId: string) => unknown;
      };
    }).commands;

    if (!commands?.executeCommandById) {
      new Notice("已保存卡片，但当前 Obsidian 无法直接调用同步命令，请手动运行 Export to Anki 扫描");
      return;
    }

    for (const commandId of commandIds) {
      try {
        const result = commands.executeCommandById(commandId);
        if (result instanceof Promise) {
          await result;
        }
        if (result !== false) {
          new Notice("已尝试调用 Export to Anki 同步，请确认 Anki 已打开并启用 AnkiConnect");
          return;
        }
      } catch {
        continue;
      }
    }

    new Notice("已保存卡片，但未找到 Export to Anki 同步命令，请手动运行 Scan Vault");
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
