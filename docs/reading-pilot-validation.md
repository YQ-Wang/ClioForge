# 阅读批注助手 · 真实材料验证

2026-09-05（America/Los_Angeles）。本次用隔离 Miniflare D1 / R2 项目验证高亮、讨论、固定页回答与人工审读边界，没有修改生产项目。第一次真实调用暴露格式问题；针对结构约束修正后，第二次受控调用通过 JSON、编号与逐字引文检查，保留人工审读关口。测试仅使用已授权的现有 OpenRouter / `z-ai/glm-5.3-flash` 连接，解密后核对授权密钥提示并在内存中使用；只读查询的临时凭据文件均已删除。

## 研究任务

使用 [Aeneas LED 数据集](https://storage.googleapis.com/ithaca-resources/models/led.json) 的 HD010004，选择原文 `parentes filio dulcissimo`，记录“这里的 parentes 是亲属关系还是官职？”的阅读批注，再提问如何分类、哪些内容不能从此页确定。材料来自已有项目 fixture，保留逐字原文、CC BY-SA 4.0 许可、LED / Heidelberg 归属与来源记录；这是便利样本，未重新下载整个数据集。

测试通过实际 `addEvidence`、`readingPage`、`readingThread` 和 `startReadingAssistant` 进入现有研究执行链。模型收到一页固定原文、选中文字、批注与讨论快照。使用 high thinking，一次调用，最多 2,048 输出 token，项目预算 $0.02；沿用 OpenRouter 每百万输入 / 输出 token $0.15 / $0.5 的路由费率上限。

## 真实结果：发现格式失败，没有自动重试

模型返回成功，但 `summary` 字符串中的双引号没有转义，导致整个 JSON 无法解析。系统将任务保留为 `uncertain`，人审与发布步骤均为 `blocked`，没有研究成果被发布。本次调用没有再次发起，不能把这次试跑称为成功交付了可采纳的助手回答。

模型使用 895 输入 token、810 输出 token，应用按所设费率记录 **$0.000540**；这不是与供应商最终账单的对账结果。调用前写入一次性记录，脚本拒绝重复发起收费调用。

对原始返回做了独立、只读检查，没有修复或重新提交模型输出：

- 三条引文均来自 HD010004 的同一固定页，逐字匹配。这个检查不能替代失败的完整输出验收，也不证明解释正确。
- 回答把 `parentes` 解释为父母关系，反对将其当作官职，并说明确切年代等内容无法从当前页推出。
- 回答没有按要求给摘要中的判断添加 `[1]` 等引用编号；同时扩展到年龄、立碑人与死者关系等内容。“立碑人 / 献词人”的归类含解释，不应直接作为专业史学已确认的事实。
- 所以实际缺口是输出格式可靠性、判断与引文的明确关联，以及控制回答范围。不能通过忽略格式错误或自动采纳文本来掩盖这些缺口。

## 针对失败的修正与第二次受控验证

原请求已经使用 `response_format: json_object`。查阅 [OpenRouter 官方结构化输出文档](https://openrouter.ai/docs/guides/features/structured-outputs)，并只读查询当日 GLM 5.3 Flash 的公开端点能力后，为阅读助手增加固定格式 `reading_answer_v1`。该格式沿任务、费用记录中的模型快照传递给 provider，兼容 OpenAI / OpenRouter 的请求使用 `json_schema` 与 `strict: true`。保留既有要求参数能力和费率上限的路由设置；没有开启响应修复插件，不猜补引号。其它任务仍保持原来的格式，Anthropic / Google 的默认请求未变。

阅读回答只允许摘要、引文列表和局限列表。服务器另外检查引用编号必须存在、所有引文都被摘要使用，并继续核对实际原文版本、页码与逐字位置。结构约束与编号检查不负责判定历史解释是否成立。

第二次使用相同公开材料和问题，先在调用适配器断言任务标记已传至实际 `json_schema` 请求，再调用一次：

- 供应商原始结果是合法 JSON，无自动修复。两条引文逐字匹配固定页，摘要编号与列表对应。
- 模型步骤 `succeeded`、独立引文核查成功、人工步骤 `ready`、发布步骤 `blocked`，成果数为 0。
- 983 输入 token、1,303 输出 token，应用记录 **$0.000799**；两次受控调用合计 **$0.001339**，仍未与供应商最终账单对账。
- 增加新讨论后提示回答上下文已变化，原答案未重写；相同请求重放没有再次派发。
- 模型识别亲属称谓并避免补推年代，但把“立碑人 / 父母”及部分语法解释表述得偏确定；还有一句关于开发批注的说明附上了史料引用编号，其真正依据应是批注元数据。这说明编号和逐字引用正确，仍不能证明每句话都被该引文充分支持。答案留给研究者审读，没有自动采纳。

本次没有为了获得成功结果进行盲重试。第二次调用针对明确发现的格式缺陷，先完成请求约束与不收费回归，再单独运行；不再继续收费调用。

## 已通过的流程与持久化检查

- 高亮锚点的字符位置、页码、版本与原话一致，讨论可以回到该锚点。
- 增加后续评论后，原回答显示上下文已变化，旧结果不被改写。
- 使用相同请求编号重新请求，返回既有任务，未再次派发或调用模型。
- 保留人工关口，没有自动发布研究结论。
- 研究 ZIP 通过应用自己的 `readBackup` 格式、原件与校验和检查；包含原文、来源许可、批注、讨论、执行记录及供应商原始返回，不包含模型密钥。
- 修正后的 ZIP 已经通过真实本地登录与恢复 HTTP 接口导入「真实模型阅读验证 · LED 高亮与批注」项目：1 份原件、1 个锚点、2 条评论及 1 份真实成功回答，固定版本与结构化锚点 ID 完成映射。恢复后的预算为 0，没有恢复密钥，也没有再次调用模型。浏览器视觉与点击验收由主任务单独完成。
- 新增结构约束 / 引用编号测试与既有 provider / Worker 定向回归共 9 项通过，无失败、无跳过；完整 TypeScript 检查与相关文件 lint 通过。完整产品测试由主任务另外执行。

## 可复验文件

- `work/reading-pilot/live-reading.ts`：一次性真实调用脚本；安全校验失败或已有调用标记时不再发起收费调用。
- `work/reading-pilot/LED-reading-annotations.zip`：保留第一次格式失败的研究包。
- `work/reading-pilot/LED-reading-schema-annotations.zip`：修正后成功运行、等待人工审读的研究包。
- `work/reading-pilot/live-reading-schema.ts`：修正后的受控验证脚本，包含实际请求格式断言。
- `work/reading-pilot/result.json`、`work/reading-pilot/schema-result.json`：两次流程状态、用量、费用和上下文变化。
- `work/reading-pilot/response-inspection.json`：JSON 失败位置与独立逐字引文检查。
- `work/reading-pilot/provider-capabilities.json`：只读端点能力和费率快照。
- `work/reading-pilot/paid-call-started.json`、`work/reading-pilot/paid-schema-call-started.json`：各一次调用标记，无凭据。
- `work/reading-pilot/local-restore.json`：本地恢复后的阅读与任务深链，项目预算为 0。
- `work/reading-pilot/provider-tests.log`：9 项定向回归结果。

本次是开发者完成的软件与小样本观察，不是历史学专家评审、准确率测定或节省时间的证明。后续仍须通过研究者的真实任务，评估遗漏、错误采纳及完整核查时间；持续保留原始返回与人工审读状态。
