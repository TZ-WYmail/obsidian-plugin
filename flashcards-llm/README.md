# 闪卡 LLM（自改中文版）

这是一个面向个人 Obsidian + Anki 工作流修改的 AI 制卡插件。插件会把 Obsidian 中选中的文本或 `==高亮内容==` 发送给兼容 OpenAI 接口的大语言模型，并生成可被 Export to Anki / Obsidian_to_Anki 识别的卡片文本。

## 当前自改能力

- 选中文本后自动显示浮动按钮：`问答卡` 和 `知识点卡`。
- 支持生成问答卡片，输出 `START / Basic / Q: / A: / END` 结构。
- 支持生成知识点卡片，优先输出 `START / Cloze / {{c1::...}} / END` 结构。
- 保存前提供预览与编辑弹窗，可修改模型输出后再确认生成。
- 点击确认后会在当前笔记同目录创建 `笔记名-card` 文件夹，并把本次卡片保存为独立 Markdown 文件。
- 保存成功后会尝试调用 Export to Anki 的扫描命令同步到 Anki。
- 知识点模式增加空结果兜底：流式响应为空会自动重试非流式请求，仍为空时会生成一张兜底知识点卡，避免预览框空白。
- 支持兼容 OpenAI 的接口地址，可配置 DeepSeek、通义千问、智谱、月之暗面、本地 Ollama 等供应商。
- 插件界面、命令、通知、设置页和内置提示词已改为中文，便于确认当前加载的是自改版本。

## 推荐设置

在 Obsidian 插件设置中填写：

- `API 基础地址`：供应商接口根地址，例如 `https://api.deepseek.com`。
- `API 请求路径`：通常填写 `/v1/chat/completions`。
- `鉴权请求头`：通常填写 `Authorization`。
- `鉴权前缀`：通常填写 `Bearer `，注意末尾空格。
- `API Key`：填写供应商控制台生成的密钥。
- `模型名称`：例如 `deepseek-chat`、`qwen-plus`、`glm-4-plus`、`moonshot-v1-8k`。
- `输出格式`：保持 `Obsidian_to_Anki（推荐）`。

## 使用方式

1. 在 Obsidian 源码模式中选中需要记忆的内容。
2. 等待选区上方出现浮动按钮。
3. 点击 `问答卡`，生成 Q/A 形式卡片。
4. 点击 `知识点卡`，生成知识点或填空形式卡片。
5. 在预览弹窗中检查和修改结果。
6. 点击 `确认生成并同步`。
7. 插件会先保存到当前笔记同目录的 `笔记名-card` 文件夹，再尝试调用 Export to Anki 同步到 Anki。

预览弹窗不会再提供“插入当前笔记”按钮，避免卡片保存位置不明确。

如果没有选中文本，命令入口会优先提取当前笔记中的 `==高亮内容==` 作为制卡材料；如果也没有高亮，则使用整篇笔记作为上下文。

## 输出格式

问答卡片示例：

```markdown
<!-- CARD -->
START
Basic
Q: FSRS 的作用是什么？
A: FSRS 是 Anki 的间隔重复调度算法，用于根据记忆状态安排复习时间。
END
```

填空卡片示例：

```markdown
<!-- CARD -->
START
Cloze
FSRS 是 Anki 的 {{c1::间隔重复调度算法}}。
END
```

这些格式会被 Obsidian_to_Anki 读取，并通过 AnkiConnect 写入 Anki 的指定牌组。

## 维护说明

本目录不再作为独立 Git 仓库维护。所有修改统一由父仓库 `E:\Project\obsidian-plugin` 进行版本管理和推送。
