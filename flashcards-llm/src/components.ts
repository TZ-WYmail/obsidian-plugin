import { App, Modal, Setting, TextAreaComponent } from "obsidian";
import { CardMode } from "./flashcards";
import { FlashcardsSettings } from "./settings";
import FlashcardsLLMPlugin from "./main";
import { availableReasoningModels } from "./models";

export interface GenerationRequest {
  configuration: FlashcardsSettings;
  mode: CardMode;
}

export interface PreviewResult {
  text: string;
}

export interface PreviewModalOptions {
  generating?: boolean;
  onCancel?: () => void;
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
  private readonly onSubmit: (result: PreviewResult) => void;
  private readonly onCancel?: () => void;
  private textArea?: TextAreaComponent;
  private statusEl?: HTMLElement;
  private submitButtonEl?: HTMLButtonElement;
  private generating: boolean;
  private submitStarted = false;

  constructor(
    app: App,
    initialText: string,
    onSubmit: (result: PreviewResult) => void,
    options: PreviewModalOptions = {}
  ) {
    super(app);
    this.textValue = initialText;
    this.onSubmit = onSubmit;
    this.onCancel = options.onCancel;
    this.generating = options.generating ?? false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("flashcards-llm-preview-modal");
    contentEl.createEl("h2", { text: "预览并编辑卡片" });
    contentEl.createEl("p", {
      text: "确认后会保存到当前笔记同目录的「笔记名-card」文件夹，并尝试调用 Export to Anki 同步；不会修改当前笔记正文。"
    });
    this.statusEl = contentEl.createEl("p", {
      cls: "flashcards-llm-preview-status",
      text: this.generating ? "正在连接模型并流式生成，请稍候..." : "可编辑后确认保存并同步。"
    });

    this.textArea = new TextAreaComponent(contentEl);
    this.textArea.setValue(this.textValue);
    this.textArea.inputEl.addClass("flashcards-llm-preview-textarea");
    this.textArea.inputEl.rows = 20;
    this.textArea.inputEl.readOnly = this.generating;
    this.textArea.onChange((value) => {
      this.textValue = value;
      this.updateSubmitState();
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("确认生成并同步").setCta().onClick(() => {
          this.submitStarted = true;
          this.close();
          this.onSubmit({
            text: this.textValue.trim()
          });
        })
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.close();
        })
      );
    this.submitButtonEl = contentEl.querySelector(".setting-item button.mod-cta") as HTMLButtonElement | null ?? undefined;
    this.updateSubmitState();
  }

  onClose() {
    if (this.generating && !this.submitStarted) {
      this.onCancel?.();
    }
    this.contentEl.empty();
  }

  setText(text: string) {
    this.textValue = text;
    this.textArea?.setValue(text);
    this.scrollToBottom();
    this.updateSubmitState();
  }

  appendText(delta: string) {
    if (!delta) return;
    this.textValue += delta;
    this.textArea?.setValue(this.textValue);
    this.scrollToBottom();
    this.updateSubmitState();
  }

  setGenerating(generating: boolean) {
    this.generating = generating;
    if (this.textArea) {
      this.textArea.inputEl.readOnly = generating;
    }
    if (this.statusEl && generating) {
      this.statusEl.removeClass("flashcards-llm-preview-status-error");
      this.statusEl.setText("正在流式生成卡片内容...");
    }
    this.updateSubmitState();
  }

  setStatus(message: string) {
    this.statusEl?.removeClass("flashcards-llm-preview-status-error");
    this.statusEl?.setText(message);
  }

  setError(message: string) {
    this.generating = false;
    if (this.textArea) {
      this.textArea.inputEl.readOnly = false;
    }
    this.statusEl?.addClass("flashcards-llm-preview-status-error");
    this.statusEl?.setText(message);
    this.updateSubmitState();
  }

  private updateSubmitState() {
    if (this.submitButtonEl) {
      this.submitButtonEl.disabled = this.generating || !this.textValue.trim();
    }
  }

  private scrollToBottom() {
    const inputEl = this.textArea?.inputEl;
    if (inputEl) {
      inputEl.scrollTop = inputEl.scrollHeight;
    }
  }
}
