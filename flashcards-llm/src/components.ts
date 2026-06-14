import { App, Modal, Setting, TextAreaComponent } from "obsidian";
import { CardMode, renderCards } from "./flashcards";
import { FlashcardsSettings } from "./settings";
import FlashcardsLLMPlugin from "./main";
import { availableReasoningModels } from "./models";

export interface GenerationRequest {
  configuration: FlashcardsSettings;
  mode: CardMode;
}

export type InsertMode = "replace-selection" | "append";

export interface PreviewResult {
  text: string;
  insertMode: InsertMode;
}

export class GenerateModeModal extends Modal {
  plugin: FlashcardsLLMPlugin;
  configuration: FlashcardsSettings;
  mode: CardMode;
  onSubmit: (request: GenerationRequest) => void;

  constructor(
    app: App,
    plugin: FlashcardsLLMPlugin,
    onSubmit: (request: GenerationRequest) => void,
    defaultMode: CardMode = "qa"
  ) {
    super(app);
    this.plugin = plugin;
    this.configuration = { ...plugin.settings };
    this.mode = defaultMode;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "生成 Anki 卡片" });

    new Setting(contentEl)
      .setName("生成模式")
      .setDesc("选择将选中文本或高亮内容整理成哪类卡片")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            qa: "问答卡片",
            knowledge: "知识点卡片"
          })
          .setValue(this.mode)
          .onChange((value: CardMode) => {
            this.mode = value;
          })
      );

    new Setting(contentEl)
      .setName("模型")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4o / deepseek-chat / qwen-plus")
          .setValue(this.configuration.model)
          .onChange((value) => {
            const trimmed = value.trim();
            this.configuration.model = trimmed;
            reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(trimmed));
          })
      );

    const reasoningEffortSetting = new Setting(contentEl)
      .setName("推理强度")
      .setDesc("仅对支持推理强度参数的模型生效")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            low: "低",
            medium: "中",
            high: "高"
          })
          .setValue(this.configuration.reasoningEffort)
          .onChange((value) => {
            this.configuration.reasoningEffort = value;
          })
      );
    reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(this.configuration.model));

    new Setting(contentEl)
      .setName("卡片数量")
      .setDesc("本次最多生成的卡片数量")
      .addText((text) =>
        text.setValue(String(this.configuration.flashcardsCount)).onChange((value) => {
          this.configuration.flashcardsCount = Number(value);
        })
      );

    new Setting(contentEl)
      .setName("本次附加提示词")
      .setDesc("可选，只影响这次生成")
      .addTextArea((text) =>
        text.setValue(this.configuration.additionalPrompt).onChange((value) => {
          this.configuration.additionalPrompt = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("开始生成").setCta().onClick(() => {
          this.close();
          this.onSubmit({
            configuration: this.configuration,
            mode: this.mode
          });
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class PreviewModal extends Modal {
  private textValue: string;
  private insertMode: InsertMode;
  private readonly onSubmit: (result: PreviewResult) => void;
  private textArea?: TextAreaComponent;

  constructor(app: App, initialCards: string[], hasSelection: boolean, onSubmit: (result: PreviewResult) => void) {
    super(app);
    this.textValue = renderCards(initialCards);
    this.insertMode = hasSelection ? "replace-selection" : "append";
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("flashcards-llm-preview-modal");
    contentEl.createEl("h2", { text: "预览并编辑卡片" });

    new Setting(contentEl)
      .setName("写回方式")
      .setDesc("选择替换当前选中文本，或追加到当前笔记末尾")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "replace-selection": "替换选中文本",
            append: "追加到笔记末尾"
          })
          .setValue(this.insertMode)
          .onChange((value: InsertMode) => {
            this.insertMode = value;
          })
      );

    this.textArea = new TextAreaComponent(contentEl);
    this.textArea.setValue(this.textValue);
    this.textArea.inputEl.addClass("flashcards-llm-preview-textarea");
    this.textArea.inputEl.rows = 20;
    this.textArea.onChange((value) => {
      this.textValue = value;
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("插入卡片").setCta().onClick(() => {
          this.close();
          this.onSubmit({
            text: this.textValue.trim(),
            insertMode: this.insertMode
          });
        })
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
