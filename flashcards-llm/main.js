/*
这是由 ESBUILD 生成的打包文件
如需查看源码，请打开本插件所在仓库目录
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FlashcardsLLMPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/flashcards.ts
function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}
function buildUrl(baseUrl, apiPath) {
  const root = normalizeBaseUrl(baseUrl);
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${root}${path}`;
}
function buildHeaders(settings) {
  var _a, _b;
  const headers = {
    "Content-Type": "application/json"
  };
  const extra = (_a = settings.extraHeadersJson) == null ? void 0 : _a.trim();
  if (settings.apiKey) {
    headers[settings.authHeader || "Authorization"] = `${(_b = settings.authPrefix) != null ? _b : "Bearer "}${settings.apiKey}`;
  }
  if (extra) {
    try {
      Object.assign(headers, JSON.parse(extra));
    } catch (e) {
      throw new Error("\u989D\u5916\u8BF7\u6C42\u5934 JSON \u683C\u5F0F\u65E0\u6548");
    }
  }
  return headers;
}
function stripExistingCards(text) {
  const marker = /<!-- CARD -->[\s\S]*?(?=(?:\n<!-- CARD -->|\s*$))/g;
  return text.replace(marker, "").trim();
}
function buildModeInstructions(mode) {
  if (mode === "qa") {
    return [
      "\u8BF7\u53EA\u628A\u6750\u6599\u6574\u7406\u6210\u95EE\u7B54\u5361\u7247\u3002",
      "\u6BCF\u5F20\u95EE\u7B54\u5361\u5FC5\u987B\u4E25\u683C\u4F7F\u7528\u4E0B\u9762\u7684\u7ED3\u6784\uFF1A",
      "START",
      "Basic",
      "Q: ...",
      "A: ...",
      "END",
      "\u6BCF\u4E2A\u95EE\u9898\u53EA\u8003\u5BDF\u4E00\u4E2A\u8BB0\u5FC6\u70B9\uFF0C\u95EE\u9898\u548C\u7B54\u6848\u90FD\u4F7F\u7528\u4E2D\u6587\uFF0C\u7B54\u6848\u4FDD\u6301\u7B80\u6D01\u51C6\u786E\u3002",
      "\u5373\u4F7F\u6750\u6599\u5F88\u77ED\uFF0C\u4E5F\u5FC5\u987B\u81F3\u5C11\u751F\u6210 1 \u5F20\u5361\u7247\uFF0C\u4E0D\u80FD\u8FD4\u56DE\u7A7A\u5185\u5BB9\u3002"
    ];
  }
  return [
    "\u8BF7\u628A\u6750\u6599\u76F4\u63A5\u6574\u7406\u6210\u77E5\u8BC6\u70B9\u5361\u7247\u3002",
    "\u5982\u679C\u539F\u53E5\u9002\u5408\u76F4\u63A5\u8BB0\u5FC6\uFF0C\u4F18\u5148\u751F\u6210\u586B\u7A7A\u5361\u7247\u3002",
    "\u586B\u7A7A\u5361\u5FC5\u987B\u4E25\u683C\u4F7F\u7528\u4E0B\u9762\u7684\u7ED3\u6784\uFF1A",
    "START",
    "Cloze",
    "\u542B\u6709 {{c1::\u586B\u7A7A\u5185\u5BB9}} \u7684\u5B8C\u6574\u53E5\u5B50\u3002",
    "END",
    "\u5982\u679C\u4E0D\u9002\u5408\u505A\u586B\u7A7A\u5361\uFF0C\u53EF\u4EE5\u6539\u7528\u4E0B\u9762\u7684\u95EE\u7B54\u7ED3\u6784\uFF1A",
    "START",
    "Basic",
    "Q: ...",
    "A: ...",
    "END",
    "\u77E5\u8BC6\u70B9\u8981\u539F\u5B50\u5316\uFF0C\u907F\u514D\u628A\u591A\u4E2A\u65E0\u5173\u4E8B\u5B9E\u585E\u8FDB\u540C\u4E00\u5F20\u5361\u3002",
    "\u5373\u4F7F\u6750\u6599\u5F88\u77ED\uFF0C\u4E5F\u5FC5\u987B\u81F3\u5C11\u751F\u6210 1 \u5F20\u5361\u7247\uFF0C\u4E0D\u80FD\u8FD4\u56DE\u7A7A\u5185\u5BB9\u3002"
  ];
}
function buildPrompt(mode, count, systemPrompt, additionalPrompt) {
  if (systemPrompt.trim()) {
    return systemPrompt.trim();
  }
  const promptParts = [
    "\u4F60\u662F Obsidian \u5230 Anki \u7684\u5236\u5361\u52A9\u624B\uFF0C\u8D1F\u8D23\u628A Obsidian \u7B14\u8BB0\u6574\u7406\u6210\u53EF\u88AB Obsidian_to_Anki \u8BC6\u522B\u7684\u5361\u7247\u3002",
    `\u6700\u591A\u751F\u6210 ${count} \u5F20\u5361\u7247\uFF1B\u5982\u679C\u539F\u6587\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u53EF\u4EE5\u53EA\u751F\u6210 1 \u5230 ${count} \u5F20\u3002`,
    "\u53EA\u8F93\u51FA markdown \u6587\u672C\u3002",
    "\u6BCF\u5F20\u5361\u7247\u90FD\u5FC5\u987B\u4EE5 `<!-- CARD -->` \u5F00\u59CB\u3002",
    "\u4E0D\u8981\u5728\u5361\u7247\u5916\u6DFB\u52A0\u89E3\u91CA\u3001\u6807\u9898\u3001\u9879\u76EE\u7B26\u53F7\u6216\u989D\u5916\u8BF4\u660E\u3002",
    "\u6BCF\u5F20\u5361\u7247\u53EA\u8986\u76D6\u4E00\u4E2A\u72EC\u7ACB\u8BB0\u5FC6\u70B9\uFF0C\u907F\u514D\u91CD\u590D\u3002",
    "\u5982\u679C\u65E0\u6CD5\u751F\u6210\u5B8C\u7F8E\u5361\u7247\uFF0C\u4E5F\u8981\u8F93\u51FA\u6700\u5408\u7406\u7684\u4E00\u5F20\u5361\u7247\uFF0C\u7EDD\u4E0D\u80FD\u8FD4\u56DE\u7A7A\u767D\u3002",
    ...buildModeInstructions(mode)
  ];
  let prompt = promptParts.join("\n");
  if (additionalPrompt.trim()) {
    prompt += `
\u989D\u5916\u8981\u6C42\uFF1A
${additionalPrompt.trim()}`;
  }
  return prompt;
}
function stripOuterCodeFence(raw) {
  return raw.trim().replace(/^```[\w-]*\s*/m, "").replace(/\s*```$/m, "").trim();
}
function parseCards(raw) {
  const cleaned = stripOuterCodeFence(raw);
  const parts = cleaned.includes("<!-- CARD -->") ? cleaned.split(/<!-- CARD -->/g) : [cleaned];
  return parts.map((part) => part.trim()).map(stripOuterCodeFence).filter((card) => card.length > 0);
}
function buildFallbackCard(source, mode) {
  const compactSource = source.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!compactSource) {
    throw new Error("\u9009\u4E2D\u6587\u672C\u6216\u9AD8\u4EAE\u5185\u5BB9\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u751F\u6210\u5361\u7247");
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
    "Q: \u8FD9\u6BB5\u5185\u5BB9\u7684\u6838\u5FC3\u77E5\u8BC6\u70B9\u662F\u4EC0\u4E48\uFF1F",
    `A: ${compactSource}`,
    "END"
  ].join("\n");
}
async function postJson(url, headers, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`\u8BF7\u6C42\u5931\u8D25\uFF1A${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`);
  }
  return response;
}
function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      var _a, _b;
      if (typeof item === "string")
        return item;
      if (item && typeof item === "object") {
        const record = item;
        return contentToText((_b = (_a = record.text) != null ? _a : record.content) != null ? _b : record.output_text);
      }
      return "";
    }).join("");
  }
  return "";
}
function extractResponseText(data) {
  if (!data || typeof data !== "object") {
    return "";
  }
  const record = data;
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0];
    const delta = choice.delta;
    const message = choice.message;
    return contentToText(delta == null ? void 0 : delta.content) || contentToText(delta == null ? void 0 : delta.text) || contentToText(message == null ? void 0 : message.content) || contentToText(choice.text);
  }
  const outputText = contentToText(record.output_text) || contentToText(record.response);
  if (outputText) {
    return outputText;
  }
  const output = record.output;
  if (Array.isArray(output)) {
    return output.map((item) => contentToText(item == null ? void 0 : item.content)).join("");
  }
  return "";
}
async function readJsonResponse(response) {
  const data = await response.json();
  return extractResponseText(data).trim();
}
function payloadToDelta(payload) {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === "[DONE]") {
    return "";
  }
  try {
    return extractResponseText(JSON.parse(trimmed));
  } catch (e) {
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return payload;
    }
    return null;
  }
}
function getDataPayloads(block) {
  const dataLines = block.split("\n").map((line) => line.trimStart()).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, ""));
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
async function readStreamResponse(response, onDelta) {
  var _a;
  const reader = (_a = response.body) == null ? void 0 : _a.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let result = "";
  const appendDelta = (delta) => {
    if (!delta)
      return;
    result += delta;
    onDelta == null ? void 0 : onDelta(delta);
  };
  const processEventBlock = (block) => {
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
      if (newlineIndex < 0)
        return;
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
function buildRequestBody(settings, prompt, cleanedText, mode, stream) {
  const requestBody = {
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
function renderCards(cards) {
  return cards.map((card) => `<!-- CARD -->
${card.trim()}`).join("\n\n");
}
async function generateFlashcardsWithProgress(text, settings, mode, progress = {}) {
  var _a, _b;
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
    (_a = progress.onRetry) == null ? void 0 : _a.call(progress);
    const retryResponse = await postJson(
      url,
      headers,
      buildRequestBody(settings, prompt, cleanedText, mode, false),
      progress.signal
    );
    raw = await readJsonResponse(retryResponse);
    if (raw.trim()) {
      (_b = progress.onDelta) == null ? void 0 : _b.call(progress, raw);
    }
  }
  const parsed = parseCards(raw);
  const cards = parsed.length ? parsed : [buildFallbackCard(cleanedText, mode)];
  return { cards, raw };
}

// src/components.ts
var import_obsidian = require("obsidian");

// src/models.ts
function availableReasoningModels() {
  return ["o1", "o1-mini", "o3-mini", "o4-mini"];
}

// src/components.ts
var GenerateModeModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onSubmit, defaultMode = "qa") {
    super(app);
    this.plugin = plugin;
    this.configuration = { ...plugin.settings };
    this.mode = defaultMode;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u751F\u6210 Anki \u5361\u7247" });
    new import_obsidian.Setting(contentEl).setName("\u751F\u6210\u6A21\u5F0F").setDesc("\u9009\u62E9\u5C06\u9009\u4E2D\u6587\u672C\u6216\u9AD8\u4EAE\u5185\u5BB9\u6574\u7406\u6210\u54EA\u7C7B\u5361\u7247").addDropdown(
      (dropdown) => dropdown.addOptions({
        qa: "\u95EE\u7B54\u5361\u7247",
        knowledge: "\u77E5\u8BC6\u70B9\u5361\u7247"
      }).setValue(this.mode).onChange((value) => {
        this.mode = value;
      })
    );
    new import_obsidian.Setting(contentEl).setName("\u6A21\u578B").addText(
      (text) => text.setPlaceholder("gpt-4o / deepseek-chat / qwen-plus").setValue(this.configuration.model).onChange((value) => {
        const trimmed = value.trim();
        this.configuration.model = trimmed;
        reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(trimmed));
      })
    );
    const reasoningEffortSetting = new import_obsidian.Setting(contentEl).setName("\u63A8\u7406\u5F3A\u5EA6").setDesc("\u4EC5\u5BF9\u652F\u6301\u63A8\u7406\u5F3A\u5EA6\u53C2\u6570\u7684\u6A21\u578B\u751F\u6548").addDropdown(
      (dropdown) => dropdown.addOptions({
        low: "\u4F4E",
        medium: "\u4E2D",
        high: "\u9AD8"
      }).setValue(this.configuration.reasoningEffort).onChange((value) => {
        this.configuration.reasoningEffort = value;
      })
    );
    reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(this.configuration.model));
    new import_obsidian.Setting(contentEl).setName("\u5361\u7247\u6570\u91CF").setDesc("\u672C\u6B21\u6700\u591A\u751F\u6210\u7684\u5361\u7247\u6570\u91CF").addText(
      (text) => text.setValue(String(this.configuration.flashcardsCount)).onChange((value) => {
        this.configuration.flashcardsCount = Number(value);
      })
    );
    new import_obsidian.Setting(contentEl).setName("\u672C\u6B21\u9644\u52A0\u63D0\u793A\u8BCD").setDesc("\u53EF\u9009\uFF0C\u53EA\u5F71\u54CD\u8FD9\u6B21\u751F\u6210").addTextArea(
      (text) => text.setValue(this.configuration.additionalPrompt).onChange((value) => {
        this.configuration.additionalPrompt = value;
      })
    );
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("\u5F00\u59CB\u751F\u6210").setCta().onClick(() => {
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
};
var PreviewModal = class extends import_obsidian.Modal {
  constructor(app, initialText, onSubmit, options = {}) {
    var _a;
    super(app);
    this.submitStarted = false;
    this.textValue = initialText;
    this.onSubmit = onSubmit;
    this.onCancel = options.onCancel;
    this.generating = (_a = options.generating) != null ? _a : false;
  }
  onOpen() {
    var _a;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("flashcards-llm-preview-modal");
    contentEl.createEl("h2", { text: "\u9884\u89C8\u5E76\u7F16\u8F91\u5361\u7247" });
    contentEl.createEl("p", {
      text: "\u786E\u8BA4\u540E\u4F1A\u4FDD\u5B58\u5230\u5F53\u524D\u7B14\u8BB0\u540C\u76EE\u5F55\u7684\u300C\u7B14\u8BB0\u540D-card\u300D\u6587\u4EF6\u5939\uFF0C\u5E76\u5C1D\u8BD5\u8C03\u7528 Export to Anki \u540C\u6B65\uFF1B\u4E0D\u4F1A\u4FEE\u6539\u5F53\u524D\u7B14\u8BB0\u6B63\u6587\u3002"
    });
    this.statusEl = contentEl.createEl("p", {
      cls: "flashcards-llm-preview-status",
      text: this.generating ? "\u6B63\u5728\u8FDE\u63A5\u6A21\u578B\u5E76\u6D41\u5F0F\u751F\u6210\uFF0C\u8BF7\u7A0D\u5019..." : "\u53EF\u7F16\u8F91\u540E\u786E\u8BA4\u4FDD\u5B58\u5E76\u540C\u6B65\u3002"
    });
    this.textArea = new import_obsidian.TextAreaComponent(contentEl);
    this.textArea.setValue(this.textValue);
    this.textArea.inputEl.addClass("flashcards-llm-preview-textarea");
    this.textArea.inputEl.rows = 20;
    this.textArea.inputEl.readOnly = this.generating;
    this.textArea.onChange((value) => {
      this.textValue = value;
      this.updateSubmitState();
    });
    new import_obsidian.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("\u786E\u8BA4\u751F\u6210\u5E76\u540C\u6B65").setCta().onClick(() => {
        this.submitStarted = true;
        this.close();
        this.onSubmit({
          text: this.textValue.trim()
        });
      })
    ).addButton(
      (btn) => btn.setButtonText("\u53D6\u6D88").onClick(() => {
        this.close();
      })
    );
    this.submitButtonEl = (_a = contentEl.querySelector(".setting-item button.mod-cta")) != null ? _a : void 0;
    this.updateSubmitState();
  }
  onClose() {
    var _a;
    if (this.generating && !this.submitStarted) {
      (_a = this.onCancel) == null ? void 0 : _a.call(this);
    }
    this.contentEl.empty();
  }
  setText(text) {
    var _a;
    this.textValue = text;
    (_a = this.textArea) == null ? void 0 : _a.setValue(text);
    this.scrollToBottom();
    this.updateSubmitState();
  }
  appendText(delta) {
    var _a;
    if (!delta)
      return;
    this.textValue += delta;
    (_a = this.textArea) == null ? void 0 : _a.setValue(this.textValue);
    this.scrollToBottom();
    this.updateSubmitState();
  }
  setGenerating(generating) {
    this.generating = generating;
    if (this.textArea) {
      this.textArea.inputEl.readOnly = generating;
    }
    if (this.statusEl && generating) {
      this.statusEl.removeClass("flashcards-llm-preview-status-error");
      this.statusEl.setText("\u6B63\u5728\u6D41\u5F0F\u751F\u6210\u5361\u7247\u5185\u5BB9...");
    }
    this.updateSubmitState();
  }
  setStatus(message) {
    var _a, _b;
    (_a = this.statusEl) == null ? void 0 : _a.removeClass("flashcards-llm-preview-status-error");
    (_b = this.statusEl) == null ? void 0 : _b.setText(message);
  }
  setError(message) {
    var _a, _b;
    this.generating = false;
    if (this.textArea) {
      this.textArea.inputEl.readOnly = false;
    }
    (_a = this.statusEl) == null ? void 0 : _a.addClass("flashcards-llm-preview-status-error");
    (_b = this.statusEl) == null ? void 0 : _b.setText(message);
    this.updateSubmitState();
  }
  updateSubmitState() {
    if (this.submitButtonEl) {
      this.submitButtonEl.disabled = this.generating || !this.textValue.trim();
    }
  }
  scrollToBottom() {
    var _a;
    const inputEl = (_a = this.textArea) == null ? void 0 : _a.inputEl;
    if (inputEl) {
      inputEl.scrollTop = inputEl.scrollHeight;
    }
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var FlashcardsSettingsTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "\u6A21\u578B\u4E0E\u63A5\u53E3\u914D\u7F6E" });
    new import_obsidian2.Setting(containerEl).setName("API \u57FA\u7840\u5730\u5740").setDesc("\u586B\u5199\u517C\u5BB9 OpenAI \u683C\u5F0F\u7684\u63A5\u53E3\u6839\u5730\u5740\uFF0C\u4F8B\u5982 https://api.deepseek.com\u3001https://dashscope.aliyuncs.com/compatible-mode \u6216\u672C\u5730 Ollama \u5730\u5740").addText(
      (text) => text.setPlaceholder("https://api.openai.com").setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
        this.plugin.settings.baseUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("API \u8BF7\u6C42\u8DEF\u5F84").setDesc("\u901A\u5E38\u586B\u5199 /v1/chat/completions\uFF1B\u5982\u679C\u4F9B\u5E94\u5546\u6587\u6863\u53E6\u6709\u8981\u6C42\uFF0C\u6309\u4F9B\u5E94\u5546\u6587\u6863\u586B\u5199").addText(
      (text) => text.setPlaceholder("/v1/chat/completions").setValue(this.plugin.settings.apiPath).onChange(async (value) => {
        this.plugin.settings.apiPath = value.trim() || "/v1/chat/completions";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u9274\u6743\u8BF7\u6C42\u5934").setDesc("\u5927\u591A\u6570\u4F9B\u5E94\u5546\u4F7F\u7528 Authorization\uFF0C\u5C11\u6570\u4F9B\u5E94\u5546\u4F7F\u7528 X-API-Key").addText(
      (text) => text.setPlaceholder("Authorization").setValue(this.plugin.settings.authHeader).onChange(async (value) => {
        this.plugin.settings.authHeader = value.trim() || "Authorization";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u9274\u6743\u524D\u7F00").setDesc("\u5927\u591A\u6570\u4F9B\u5E94\u5546\u4F7F\u7528 Bearer \u52A0\u7A7A\u683C\uFF1B\u5982\u679C\u4F9B\u5E94\u5546\u8981\u6C42\u76F4\u63A5\u4F20\u5BC6\u94A5\uFF0C\u53EF\u7559\u7A7A").addText(
      (text) => text.setPlaceholder("Bearer ").setValue(this.plugin.settings.authPrefix).onChange(async (value) => {
        this.plugin.settings.authPrefix = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u989D\u5916\u8BF7\u6C42\u5934 JSON").setDesc("\u53EF\u9009\u3002\u9700\u8981\u7279\u6B8A\u9274\u6743\u6216\u79DF\u6237\u53C2\u6570\u65F6\u586B\u5199 JSON \u5BF9\u8C61\uFF0C\u4F1A\u5408\u5E76\u5230\u8BF7\u6C42\u5934").addTextArea(
      (text) => text.setPlaceholder('{"X-API-Key":"..."}').setValue(this.plugin.settings.extraHeadersJson).onChange(async (value) => {
        this.plugin.settings.extraHeadersJson = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("API Key").setDesc("\u586B\u5199\u5F53\u524D\u6A21\u578B\u4F9B\u5E94\u5546\u63D0\u4F9B\u7684\u5BC6\u94A5").addText(
      (text) => text.setPlaceholder("\u5728\u8FD9\u91CC\u586B\u5165 API Key").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u6A21\u578B\u540D\u79F0").setDesc("\u4F8B\u5982 gpt-4o\u3001deepseek-chat\u3001qwen-plus\u3001glm-4-plus\u3001moonshot-v1-8k\u3001llama3.1").addText(
      (text) => text.setPlaceholder("deepseek-chat").setValue(this.plugin.settings.model).onChange(async (value) => {
        const model = value.trim();
        this.plugin.settings.model = model;
        reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(model));
        await this.plugin.saveSettings();
      })
    );
    const reasoningEffortSetting = new import_obsidian2.Setting(containerEl).setName("\u63A8\u7406\u5F3A\u5EA6").setDesc("\u4EC5\u5BF9 o \u7CFB\u5217\u7B49\u652F\u6301 reasoning_effort \u7684\u6A21\u578B\u751F\u6548").addDropdown(
      (dropdown) => dropdown.addOptions({
        low: "\u4F4E",
        medium: "\u4E2D",
        high: "\u9AD8"
      }).setValue(this.plugin.settings.reasoningEffort).onChange(async (value) => {
        this.plugin.settings.reasoningEffort = value;
        await this.plugin.saveSettings();
      })
    );
    reasoningEffortSetting.setDisabled(!availableReasoningModels().includes(this.plugin.settings.model));
    containerEl.createEl("h3", { text: "\u5361\u7247\u751F\u6210\u914D\u7F6E" });
    new import_obsidian2.Setting(containerEl).setName("\u8F93\u51FA\u683C\u5F0F").setDesc("\u5EFA\u8BAE\u4FDD\u6301\u4E3A Obsidian_to_Anki\uFF0C\u8FD9\u6837\u751F\u6210\u5185\u5BB9\u53EF\u88AB Export to Anki \u76F4\u63A5\u540C\u6B65\u5230 Anki").addDropdown(
      (dropdown) => dropdown.addOptions({
        obsidian_to_anki: "Obsidian_to_Anki\uFF08\u63A8\u8350\uFF09",
        plain: "\u7EAF\u6587\u672C"
      }).setValue(this.plugin.settings.outputMode).onChange(async (value) => {
        this.plugin.settings.outputMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u7CFB\u7EDF\u63D0\u793A\u8BCD\u8986\u76D6").setDesc("\u53EF\u9009\u3002\u7559\u7A7A\u65F6\u4F7F\u7528\u63D2\u4EF6\u5185\u7F6E\u7684 Obsidian_to_Anki \u4E2D\u6587\u63D0\u793A\u8BCD").addTextArea(
      (text) => text.setPlaceholder("\u5982\u9700\u5B8C\u5168\u81EA\u5B9A\u4E49\u63D0\u793A\u8BCD\uFF0C\u53EF\u5728\u8FD9\u91CC\u586B\u5199").setValue(this.plugin.settings.systemPrompt).onChange(async (value) => {
        this.plugin.settings.systemPrompt = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u9ED8\u8BA4\u5361\u7247\u6570\u91CF").setDesc("\u6BCF\u6B21\u6700\u591A\u751F\u6210\u51E0\u5F20\u5361\u7247\uFF1B\u5185\u5BB9\u8F83\u77ED\u65F6\u4F1A\u5C11\u4E8E\u8BE5\u6570\u91CF").addText(
      (text) => text.setPlaceholder("3").setValue(this.plugin.settings.flashcardsCount.toString()).onChange(async (value) => {
        this.plugin.settings.flashcardsCount = Number(value);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u9644\u52A0\u63D0\u793A\u8BCD").setDesc("\u53EF\u9009\u3002\u7528\u4E8E\u957F\u671F\u8865\u5145\u4F60\u7684\u5236\u5361\u504F\u597D\uFF0C\u4F8B\u5982\u201C\u5C3D\u91CF\u4F7F\u7528\u4E2D\u6587\u95EE\u9898\u3001\u7B54\u6848\u4FDD\u6301\u7B80\u6D01\u201D").addTextArea(
      (text) => text.setPlaceholder("\u5728\u8FD9\u91CC\u586B\u5199\u989D\u5916\u8981\u6C42").setValue(this.plugin.settings.additionalPrompt).onChange(async (value) => {
        this.plugin.settings.additionalPrompt = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u6700\u5927\u8F93\u51FA Token").setDesc("\u9650\u5236\u6A21\u578B\u5355\u6B21\u6700\u591A\u8F93\u51FA\u7684 token \u6570\uFF0C\u907F\u514D\u751F\u6210\u8FC7\u957F\u6216\u8D39\u7528\u8FC7\u9AD8").addText(
      (text) => text.setPlaceholder("300").setValue(this.plugin.settings.maxTokens.toString()).onChange(async (value) => {
        this.plugin.settings.maxTokens = Number(value);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u6D41\u5F0F\u8F93\u51FA").setDesc("\u5F00\u542F\u540E\u4F7F\u7528\u6D41\u5F0F\u63A5\u53E3\u8BFB\u53D6\u6A21\u578B\u7ED3\u679C\uFF1B\u5982\u679C\u67D0\u4E9B\u56FD\u4EA7\u4F9B\u5E94\u5546\u4E0D\u517C\u5BB9\uFF0C\u53EF\u5173\u95ED").addToggle(
      (on) => on.setValue(this.plugin.settings.streaming).onChange(async (enabled) => {
        this.plugin.settings.streaming = enabled;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u517C\u5BB9\u65E7\u7248\u5B57\u6BB5" });
    new import_obsidian2.Setting(containerEl).setName("\u884C\u5185\u5361\u7247\u5206\u9694\u7B26").setDesc("\u65E7\u7248\u5B57\u6BB5\uFF0C\u5F53\u524D Obsidian_to_Anki \u5DE5\u4F5C\u6D41\u901A\u5E38\u4E0D\u9700\u8981\u4FEE\u6539").addText(
      (text) => text.setPlaceholder("::").setValue(this.plugin.settings.inlineSeparator).onChange(async (value) => {
        this.plugin.settings.inlineSeparator = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u591A\u884C\u5361\u7247\u5206\u9694\u7B26").setDesc("\u65E7\u7248\u5B57\u6BB5\uFF0C\u5F53\u524D Obsidian_to_Anki \u5DE5\u4F5C\u6D41\u901A\u5E38\u4E0D\u9700\u8981\u4FEE\u6539").addText(
      (text) => text.setPlaceholder("?").setValue(this.plugin.settings.multilineSeparator).onChange(async (value) => {
        this.plugin.settings.multilineSeparator = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u5361\u7247\u6807\u7B7E").setDesc("\u65E7\u7248\u5B57\u6BB5\u3002\u5F53\u524D\u540C\u6B65\u5230 Anki \u65F6\uFF0C\u4E3B\u8981\u7531 Export to Anki \u7684\u9ED8\u8BA4\u6807\u7B7E\u63A7\u5236").addText(
      (text) => text.setPlaceholder("#flashcards").setValue(this.plugin.settings.tag).onChange(async (value) => {
        this.plugin.settings.tag = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u9884\u89C8\u6A21\u5F0F\u9690\u85CF\u5361\u7247").setDesc("\u5F00\u542F\u540E\uFF0CObsidian \u9605\u8BFB\u6A21\u5F0F\u91CC\u4F1A\u9690\u85CF\u751F\u6210\u7684\u5361\u7247\u6587\u672C\uFF0C\u4F46\u4ECD\u53EF\u5728\u6E90\u7801\u6A21\u5F0F\u7F16\u8F91").addToggle(
      (on) => on.setValue(this.plugin.settings.hideInPreview).onChange(async (enabled) => {
        this.plugin.settings.hideInPreview = enabled;
        await this.plugin.saveSettings();
        const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
        if (view) {
          view.previewMode.rerender(true);
        }
      })
    );
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
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
var FlashcardsLLMPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.floatingBarEl = null;
    this.activeEditor = null;
    this.activeView = null;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "generate-qa-flashcards",
      name: "\u751F\u6210\u95EE\u7B54\u5361\u7247",
      editorCallback: (editor, view) => {
        this.openGenerationFlow(editor, view, "qa");
      }
    });
    this.addCommand({
      id: "generate-knowledge-flashcards",
      name: "\u751F\u6210\u77E5\u8BC6\u70B9\u5361\u7247",
      editorCallback: (editor, view) => {
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
  getSourceText(editor) {
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
  getActiveMarkdownEditor() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
    if (!view || view.getMode() !== "source") {
      return null;
    }
    return view.editor;
  }
  handleSelectionChange() {
    const editor = this.getActiveMarkdownEditor();
    const selection = (editor == null ? void 0 : editor.somethingSelected()) ? editor.getSelection().trim() : "";
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
    if (!rect || rect.width === 0 && rect.height === 0) {
      this.hideFloatingBar();
      return;
    }
    this.activeEditor = editor;
    this.activeView = this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
    this.showFloatingBar(rect);
  }
  showFloatingBar(rect) {
    if (!this.floatingBarEl) {
      const bar = document.createElement("div");
      bar.addClass("flashcards-llm-floating-bar");
      const qaButton = document.createElement("button");
      qaButton.type = "button";
      qaButton.textContent = "\u95EE\u7B54\u5361";
      qaButton.onmousedown = (evt) => evt.preventDefault();
      qaButton.onclick = () => this.quickGenerate("qa");
      const knowledgeButton = document.createElement("button");
      knowledgeButton.type = "button";
      knowledgeButton.textContent = "\u77E5\u8BC6\u70B9\u5361";
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
  hideFloatingBar() {
    var _a;
    (_a = this.floatingBarEl) == null ? void 0 : _a.remove();
    this.floatingBarEl = null;
  }
  async quickGenerate(mode) {
    var _a, _b;
    const editor = (_a = this.activeEditor) != null ? _a : this.getActiveMarkdownEditor();
    const view = (_b = this.activeView) != null ? _b : this.app.workspace.getActiveViewOfType(import_obsidian3.MarkdownView);
    if (!editor || !view) {
      new import_obsidian3.Notice("\u6CA1\u6709\u53EF\u7528\u7684 Markdown \u7F16\u8F91\u5668");
      return;
    }
    this.hideFloatingBar();
    await this.generateAndPreview(editor, view, this.settings, mode, this.getSourceText(editor));
  }
  openGenerationFlow(editor, view, mode) {
    new GenerateModeModal(this.app, this, async ({ configuration, mode: selectedMode }) => {
      const sourceText = this.getSourceText(editor);
      await this.generateAndPreview(editor, view, configuration, selectedMode, sourceText);
    }, mode).open();
  }
  async generateAndPreview(editor, view, configuration, mode, sourceText) {
    if (!configuration.apiKey) {
      new import_obsidian3.Notice("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u586B\u5199 API Key");
      return;
    }
    if (!configuration.model) {
      new import_obsidian3.Notice("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u586B\u5199\u6A21\u578B\u540D\u79F0");
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
    const effectiveConfig = {
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
    preview.setStatus(effectiveConfig.streaming ? "\u6B63\u5728\u8FDE\u63A5\u6A21\u578B\u5E76\u51C6\u5907\u6D41\u5F0F\u751F\u6210..." : "\u6B63\u5728\u7B49\u5F85\u6A21\u578B\u5B8C\u6574\u54CD\u5E94...");
    new import_obsidian3.Notice("\u6B63\u5728\u751F\u6210\u5361\u7247...");
    try {
      const result = await generateFlashcardsWithProgress(sourceText, effectiveConfig, mode, {
        signal: abortController.signal,
        onDelta: (delta) => {
          preview.appendText(delta);
        },
        onRetry: () => {
          preview.setText("");
          preview.setStatus("\u6D41\u5F0F\u54CD\u5E94\u4E3A\u7A7A\uFF0C\u6B63\u5728\u81EA\u52A8\u5207\u6362\u4E3A\u975E\u6D41\u5F0F\u8BF7\u6C42\u91CD\u8BD5...");
        }
      });
      preview.setText(renderCards(result.cards));
      preview.setGenerating(false);
      preview.setStatus("\u751F\u6210\u5B8C\u6210\uFF0C\u53EF\u7F16\u8F91\u540E\u786E\u8BA4\u4FDD\u5B58\u5E76\u540C\u6B65\u3002");
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      preview.setError("\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 API \u914D\u7F6E\u6216\u6253\u5F00\u5F00\u53D1\u8005\u63A7\u5236\u53F0\u67E5\u770B\u8BE6\u60C5\u3002");
      console.error("\u751F\u6210\u5361\u7247\u5931\u8D25\uFF1A", error);
      new import_obsidian3.Notice("\u751F\u6210\u5361\u7247\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63D2\u4EF6\u63A7\u5236\u53F0\u8BE6\u60C5");
    }
  }
  async saveCardsAndSync(view, text, mode) {
    if (!text.trim()) {
      new import_obsidian3.Notice("\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u5361\u7247");
      return;
    }
    const file = view.file;
    if (!(file instanceof import_obsidian3.TFile)) {
      new import_obsidian3.Notice("\u6CA1\u6709\u627E\u5230\u5F53\u524D\u7B14\u8BB0\u6587\u4EF6\uFF0C\u65E0\u6CD5\u521B\u5EFA\u5361\u7247\u6587\u4EF6\u5939");
      return;
    }
    try {
      const savedPath = await this.saveCardsToSiblingFolder(file, text, mode);
      new import_obsidian3.Notice(`\u5361\u7247\u5DF2\u4FDD\u5B58\u5230 ${savedPath}`);
      await this.trySyncToAnki();
    } catch (error) {
      console.error("\u4FDD\u5B58\u5361\u7247\u6216\u540C\u6B65 Anki \u5931\u8D25\uFF1A", error);
      new import_obsidian3.Notice("\u4FDD\u5B58\u5361\u7247\u6216\u540C\u6B65 Anki \u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63D2\u4EF6\u63A7\u5236\u53F0\u8BE6\u60C5");
    }
  }
  async saveCardsToSiblingFolder(file, text, mode) {
    var _a, _b;
    const parentPath = (_b = (_a = file.parent) == null ? void 0 : _a.path) != null ? _b : "";
    const folderName = `${file.basename}-card`;
    const folderPath = (0, import_obsidian3.normalizePath)(parentPath ? `${parentPath}/${folderName}` : folderName);
    const existingFolder = this.app.vault.getFolderByPath(folderPath);
    const existingAbstractFile = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existingFolder) {
      if (existingAbstractFile) {
        throw new Error(`\u540C\u540D\u8DEF\u5F84\u5DF2\u5B58\u5728\u4F46\u4E0D\u662F\u6587\u4EF6\u5939\uFF1A${folderPath}`);
      }
      await this.app.vault.createFolder(folderPath);
    }
    const timestamp = this.formatTimestamp(new Date());
    const modeLabel = mode === "qa" ? "\u95EE\u7B54\u5361" : "\u77E5\u8BC6\u70B9\u5361";
    const cardPath = await this.getUniqueCardPath(folderPath, `${file.basename}-card-${timestamp}.md`);
    const content = [
      "---",
      `source: "[[${file.basename}]]"`,
      `source_path: "${file.path}"`,
      `created: "${new Date().toISOString()}"`,
      `mode: "${mode}"`,
      'generator: "\u95EA\u5361 LLM\uFF08\u81EA\u6539\u4E2D\u6587\u7248\uFF09"',
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
  async getUniqueCardPath(folderPath, fileName) {
    const extensionIndex = fileName.lastIndexOf(".");
    const stem = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
    const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : "";
    let candidate = (0, import_obsidian3.normalizePath)(`${folderPath}/${fileName}`);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = (0, import_obsidian3.normalizePath)(`${folderPath}/${stem}-${index}${extension}`);
      index += 1;
    }
    return candidate;
  }
  formatTimestamp(date) {
    const pad = (value) => value.toString().padStart(2, "0");
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
  async trySyncToAnki() {
    const commandIds = [
      "obsidian-to-anki-plugin:anki-scan-vault",
      "obsidian-to-anki:anki-scan-vault"
    ];
    const commands = this.app.commands;
    if (!(commands == null ? void 0 : commands.executeCommandById)) {
      new import_obsidian3.Notice("\u5DF2\u4FDD\u5B58\u5361\u7247\uFF0C\u4F46\u5F53\u524D Obsidian \u65E0\u6CD5\u76F4\u63A5\u8C03\u7528\u540C\u6B65\u547D\u4EE4\uFF0C\u8BF7\u624B\u52A8\u8FD0\u884C Export to Anki \u626B\u63CF");
      return;
    }
    for (const commandId of commandIds) {
      try {
        const result = commands.executeCommandById(commandId);
        if (result instanceof Promise) {
          await result;
        }
        if (result !== false) {
          new import_obsidian3.Notice("\u5DF2\u5C1D\u8BD5\u8C03\u7528 Export to Anki \u540C\u6B65\uFF0C\u8BF7\u786E\u8BA4 Anki \u5DF2\u6253\u5F00\u5E76\u542F\u7528 AnkiConnect");
          return;
        }
      } catch (e) {
        continue;
      }
    }
    new import_obsidian3.Notice("\u5DF2\u4FDD\u5B58\u5361\u7247\uFF0C\u4F46\u672A\u627E\u5230 Export to Anki \u540C\u6B65\u547D\u4EE4\uFF0C\u8BF7\u624B\u52A8\u8FD0\u884C Scan Vault");
  }
  onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
