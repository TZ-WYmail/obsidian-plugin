import { App, MarkdownView, Notice, PluginSettingTab, Setting } from "obsidian";
import { createAnkiClient } from "./anki";
import { availableReasoningModels } from "./models";
import type FlashcardsLLMPlugin from "./main";

// 这些旧字段仍保留，用于兼容上游配置和旧版数据。
export interface FlashcardsSettings {
  apiKey: string;
  baseUrl: string;
  apiPath: string;
  authHeader: string;
  authPrefix: string;
  extraHeadersJson: string;
  model: string;
  inlineSeparator: string;
  multilineSeparator: string;
  flashcardsCount: number;
  additionalPrompt: string;
  systemPrompt: string;
  maxTokens: number;
  reasoningEffort: string;
  streaming: boolean;
  hideInPreview: boolean;
  tag: string;
  outputMode: string;
  ankiConnectUrl: string;
  ankiApiKey: string;
  ankiDeck: string;
  ankiDeckMode: string;
  ankiTags: string;
  autoImportToAnki: boolean;
  createMissingDeck: boolean;
  ankiBasicModel: string;
  ankiBasicFrontField: string;
  ankiBasicBackField: string;
  ankiClozeModel: string;
  ankiClozeTextField: string;
  ankiClozeExtraField: string;
}

export class FlashcardsSettingsTab extends PluginSettingTab {
  plugin: FlashcardsLLMPlugin;
  private deckNames: string[] = [];
  private deckStatus = "";
  private hasRequestedDecks = false;
  private loadingDecks = false;

  constructor(app: App, plugin: FlashcardsLLMPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h3", { text: "模型与接口配置" });

    new Setting(containerEl)
      .setName("API 基础地址")
      .setDesc("填写兼容 OpenAI 格式的接口根地址，例如 https://api.deepseek.com、https://dashscope.aliyuncs.com/compatible-mode 或本地 Ollama 地址")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API 请求路径")
      .setDesc("通常填写 /v1/chat/completions；如果供应商文档另有要求，按供应商文档填写")
      .addText((text) =>
        text
          .setPlaceholder("/v1/chat/completions")
          .setValue(this.plugin.settings.apiPath)
          .onChange(async (value) => {
            this.plugin.settings.apiPath = value.trim() || "/v1/chat/completions";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("鉴权请求头")
      .setDesc("大多数供应商使用 Authorization，少数供应商使用 X-API-Key")
      .addText((text) =>
        text
          .setPlaceholder("Authorization")
          .setValue(this.plugin.settings.authHeader)
          .onChange(async (value) => {
            this.plugin.settings.authHeader = value.trim() || "Authorization";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("鉴权前缀")
      .setDesc("大多数供应商使用 Bearer 加空格；如果供应商要求直接传密钥，可留空")
      .addText((text) =>
        text
          .setPlaceholder("Bearer ")
          .setValue(this.plugin.settings.authPrefix)
          .onChange(async (value) => {
            this.plugin.settings.authPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("额外请求头 JSON")
      .setDesc("可选。需要特殊鉴权或租户参数时填写 JSON 对象，会合并到请求头")
      .addTextArea((text) =>
        text
          .setPlaceholder('{"X-API-Key":"..."}')
          .setValue(this.plugin.settings.extraHeadersJson)
          .onChange(async (value) => {
            this.plugin.settings.extraHeadersJson = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("填写当前模型供应商提供的密钥")
      .addText((text) =>
        text
          .setPlaceholder("在这里填入 API Key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("例如 gpt-4o、deepseek-chat、qwen-plus、glm-4-plus、moonshot-v1-8k、llama3.1")
      .addText((text) =>
        text
          .setPlaceholder("deepseek-chat")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            const model = value.trim();
            this.plugin.settings.model = model;
            reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(model));
            await this.plugin.saveSettings();
          })
      );

    const reasoningEffortSetting = new Setting(containerEl)
      .setName("推理强度")
      .setDesc("仅对 o 系列等支持 reasoning_effort 的模型生效")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            low: "低",
            medium: "中",
            high: "高"
          })
          .setValue(this.plugin.settings.reasoningEffort)
          .onChange(async (value) => {
            this.plugin.settings.reasoningEffort = value;
            await this.plugin.saveSettings();
          })
      );
    reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(this.plugin.settings.model));

    containerEl.createEl("h3", { text: "卡片生成配置" });

    new Setting(containerEl)
      .setName("输出格式")
      .setDesc("建议保持为 Obsidian_to_Anki，这样生成内容可被 Export to Anki 直接同步到 Anki")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            obsidian_to_anki: "Obsidian_to_Anki（推荐）",
            plain: "纯文本"
          })
          .setValue(this.plugin.settings.outputMode)
          .onChange(async (value) => {
            this.plugin.settings.outputMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("系统提示词覆盖")
      .setDesc("可选。留空时使用插件内置的 Obsidian_to_Anki 中文提示词")
      .addTextArea((text) =>
        text
          .setPlaceholder("如需完全自定义提示词，可在这里填写")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("默认卡片数量")
      .setDesc("每次最多生成几张卡片；内容较短时会少于该数量")
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(this.plugin.settings.flashcardsCount.toString())
          .onChange(async (value) => {
            this.plugin.settings.flashcardsCount = Number(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("附加提示词")
      .setDesc("可选。用于长期补充你的制卡偏好，例如“尽量使用中文问题、答案保持简洁”")
      .addTextArea((text) =>
        text
          .setPlaceholder("在这里填写额外要求")
          .setValue(this.plugin.settings.additionalPrompt)
          .onChange(async (value) => {
            this.plugin.settings.additionalPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("最大输出 Token")
      .setDesc("限制模型单次最多输出的 token 数，避免生成过长或费用过高")
      .addText((text) =>
        text
          .setPlaceholder("300")
          .setValue(this.plugin.settings.maxTokens.toString())
          .onChange(async (value) => {
            this.plugin.settings.maxTokens = Number(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("流式输出")
      .setDesc("开启后使用流式接口读取模型结果；如果某些国产供应商不兼容，可关闭")
      .addToggle((on) =>
        on
          .setValue(this.plugin.settings.streaming)
          .onChange(async (enabled) => {
            this.plugin.settings.streaming = enabled;
            await this.plugin.saveSettings();
          })
      );

    this.renderAnkiSettings(containerEl);

    containerEl.createEl("h3", { text: "兼容旧版字段" });

    new Setting(containerEl)
      .setName("行内卡片分隔符")
      .setDesc("旧版字段，当前 Obsidian_to_Anki 工作流通常不需要修改")
      .addText((text) =>
        text
          .setPlaceholder("::")
          .setValue(this.plugin.settings.inlineSeparator)
          .onChange(async (value) => {
            this.plugin.settings.inlineSeparator = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("多行卡片分隔符")
      .setDesc("旧版字段，当前 Obsidian_to_Anki 工作流通常不需要修改")
      .addText((text) =>
        text
          .setPlaceholder("?")
          .setValue(this.plugin.settings.multilineSeparator)
          .onChange(async (value) => {
            this.plugin.settings.multilineSeparator = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("卡片标签")
      .setDesc("旧版字段。当前同步到 Anki 时，主要由 Export to Anki 的默认标签控制")
      .addText((text) =>
        text
          .setPlaceholder("#flashcards")
          .setValue(this.plugin.settings.tag)
          .onChange(async (value) => {
            this.plugin.settings.tag = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("预览模式隐藏卡片")
      .setDesc("开启后，Obsidian 阅读模式里会隐藏生成的卡片文本，但仍可在源码模式编辑")
      .addToggle((on) =>
        on
          .setValue(this.plugin.settings.hideInPreview)
          .onChange(async (enabled) => {
            this.plugin.settings.hideInPreview = enabled;

            await this.plugin.saveSettings();

            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
              view.previewMode.rerender(true);
            }
          })
      );
  }

  private renderAnkiSettings(containerEl: HTMLElement) {
    containerEl.createEl("h3", { text: "Anki 直连同步" });

    if (!this.hasRequestedDecks) {
      this.hasRequestedDecks = true;
      void this.refreshDeckNames(false);
    }

    new Setting(containerEl)
      .setName("AnkiConnect 地址")
      .setDesc("默认使用本机 AnkiConnect 服务；如果没有特殊改动，保持 127.0.0.1:8765 即可")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:8765")
          .setValue(this.plugin.settings.ankiConnectUrl)
          .onChange(async (value) => {
            this.plugin.settings.ankiConnectUrl = value.trim() || "http://127.0.0.1:8765";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("AnkiConnect API Key")
      .setDesc("如果你在 AnkiConnect 配置里启用了 apiKey，在这里填写；未启用时留空")
      .addText((text) =>
        text
          .setPlaceholder("未启用时留空")
          .setValue(this.plugin.settings.ankiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.ankiApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("牌组命名方式")
      .setDesc("默认跟随当前打开的 Markdown 文件名；例如打开“算法.md”时导入到 Anki 牌组“算法”")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            source_file: "跟随当前笔记名（推荐）",
            fixed: "使用固定牌组"
          })
          .setValue(this.plugin.settings.ankiDeckMode || "source_file")
          .onChange(async (value) => {
            this.plugin.settings.ankiDeckMode = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if ((this.plugin.settings.ankiDeckMode || "source_file") === "fixed") {
      const deckSetting = new Setting(containerEl)
        .setName("固定目标牌组")
        .setDesc("仅在“使用固定牌组”模式下生效；可点击刷新牌组从 Anki 自动读取");

      if (this.deckNames.length) {
        const options: Record<string, string> = {};
        const currentDeck = this.plugin.settings.ankiDeck || "系统默认";
        if (!this.deckNames.includes(currentDeck)) {
          options[currentDeck] = `${currentDeck}（当前设置，Anki 中未读取到）`;
        }
        for (const deck of this.deckNames) {
          options[deck] = deck;
        }
        deckSetting.addDropdown((dropdown) =>
          dropdown
            .addOptions(options)
            .setValue(currentDeck)
            .onChange(async (value) => {
              this.plugin.settings.ankiDeck = value;
              await this.plugin.saveSettings();
            })
        );
      } else {
        deckSetting.addText((text) =>
          text
            .setPlaceholder("系统默认")
            .setValue(this.plugin.settings.ankiDeck)
            .onChange(async (value) => {
              this.plugin.settings.ankiDeck = value.trim() || "系统默认";
              await this.plugin.saveSettings();
            })
        );
      }
    }

    new Setting(containerEl)
      .setName("连接与牌组")
      .setDesc(this.deckStatus || "测试连接会读取 AnkiConnect 版本和当前牌组列表")
      .addButton((btn) =>
        btn
          .setButtonText(this.loadingDecks ? "读取中..." : "刷新牌组")
          .setDisabled(this.loadingDecks)
          .onClick(async () => {
            await this.refreshDeckNames(true);
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("测试连接")
          .setCta()
          .onClick(async () => {
            await this.testAnkiConnection();
          })
      );

    new Setting(containerEl)
      .setName("自动导入到 Anki")
      .setDesc("开启后，预览确认或批量生成完成时会先保存 Markdown 卡片文件，再通过 AnkiConnect 导入 Anki")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoImportToAnki)
          .onChange(async (enabled) => {
            this.plugin.settings.autoImportToAnki = enabled;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("缺失牌组自动创建")
      .setDesc("开启后，如果目标牌组不存在，会在导入前由 AnkiConnect 自动创建")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.createMissingDeck)
          .onChange(async (enabled) => {
            this.plugin.settings.createMissingDeck = enabled;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Anki 标签")
      .setDesc("导入 Anki 时附加的标签，多个标签可用空格或英文逗号分隔")
      .addText((text) =>
        text
          .setPlaceholder("Obsidian_to_Anki flashcards_llm")
          .setValue(this.plugin.settings.ankiTags)
          .onChange(async (value) => {
            this.plugin.settings.ankiTags = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h4", { text: "Anki 模板字段映射" });

    new Setting(containerEl)
      .setName("问答模板")
      .setDesc("普通问答卡使用的 Anki 笔记类型，默认 Basic")
      .addText((text) =>
        text
          .setPlaceholder("Basic")
          .setValue(this.plugin.settings.ankiBasicModel)
          .onChange(async (value) => {
            this.plugin.settings.ankiBasicModel = value.trim() || "Basic";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("问答字段")
      .setDesc("依次填写正面字段和背面字段；默认 Front / Back")
      .addText((text) =>
        text
          .setPlaceholder("Front")
          .setValue(this.plugin.settings.ankiBasicFrontField)
          .onChange(async (value) => {
            this.plugin.settings.ankiBasicFrontField = value.trim() || "Front";
            await this.plugin.saveSettings();
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("Back")
          .setValue(this.plugin.settings.ankiBasicBackField)
          .onChange(async (value) => {
            this.plugin.settings.ankiBasicBackField = value.trim() || "Back";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("填空模板")
      .setDesc("Cloze 卡使用的 Anki 笔记类型；中文 Anki 通常是“填空题”")
      .addText((text) =>
        text
          .setPlaceholder("填空题")
          .setValue(this.plugin.settings.ankiClozeModel)
          .onChange(async (value) => {
            this.plugin.settings.ankiClozeModel = value.trim() || "填空题";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("填空字段")
      .setDesc("依次填写正文 Cloze 字段和背面额外字段；中文 Anki 通常是 文字 / 背面额外")
      .addText((text) =>
        text
          .setPlaceholder("文字")
          .setValue(this.plugin.settings.ankiClozeTextField)
          .onChange(async (value) => {
            this.plugin.settings.ankiClozeTextField = value.trim() || "文字";
            await this.plugin.saveSettings();
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("背面额外")
          .setValue(this.plugin.settings.ankiClozeExtraField)
          .onChange(async (value) => {
            this.plugin.settings.ankiClozeExtraField = value.trim() || "背面额外";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("批量操作")
      .setDesc("基于当前打开的笔记执行；批量生成会读取本插件划出的重点并自动去重")
      .addButton((btn) =>
        btn.setButtonText("批量问答").onClick(() => {
          void this.plugin.runBatchGenerateFromActiveView("qa");
        })
      )
      .addButton((btn) =>
        btn.setButtonText("批量知识点").onClick(() => {
          void this.plugin.runBatchGenerateFromActiveView("knowledge");
        })
      )
      .addButton((btn) =>
        btn.setButtonText("导入当前卡片文件夹").setCta().onClick(() => {
          void this.plugin.importCurrentNoteCardsToAnki();
        })
      );
  }

  private async refreshDeckNames(showNotice: boolean) {
    this.loadingDecks = true;
    try {
      const decks = await createAnkiClient(this.plugin.settings).deckNames();
      this.deckNames = decks.sort((a, b) => a.localeCompare(b));
      this.deckStatus = `已读取 ${decks.length} 个牌组`;
      if (!this.plugin.settings.ankiDeck && this.deckNames.length) {
        this.plugin.settings.ankiDeck = this.deckNames[0];
        await this.plugin.saveSettings();
      }
      if (showNotice) {
        new Notice(`已读取 ${decks.length} 个 Anki 牌组`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deckStatus = `读取牌组失败：${message}`;
      if (showNotice) {
        new Notice("读取 Anki 牌组失败，请确认 Anki 已启动并启用 AnkiConnect");
      }
    } finally {
      this.loadingDecks = false;
      this.display();
    }
  }

  private async testAnkiConnection() {
    try {
      const client = createAnkiClient(this.plugin.settings);
      const [version, decks, models] = await Promise.all([
        client.version(),
        client.deckNames(),
        client.modelNames()
      ]);
      this.deckNames = decks.sort((a, b) => a.localeCompare(b));
      this.deckStatus = `连接正常：AnkiConnect v${version}，${decks.length} 个牌组，${models.length} 个模板`;
      if (!this.plugin.settings.ankiDeck && this.deckNames.length) {
        this.plugin.settings.ankiDeck = this.deckNames[0];
        await this.plugin.saveSettings();
      }
      new Notice(this.deckStatus);
      this.display();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deckStatus = `连接失败：${message}`;
      new Notice(`Anki 连接失败：${message}`);
      this.display();
    }
  }
}
