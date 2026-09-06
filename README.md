# Canwoo 参伍

面向历史与人文研究的私人资料工作区：保存原件、校订文本、固定引文出处，再让 AI 在明确的材料范围内提出待核查线索。

基础设施全部使用 Cloudflare。代码目录独立于旁边的第三方 `prove2me_workspace`，不依赖或修改其代码。

已于 2026-09-04（洛杉矶时间）部署到 [canwoo.com](https://canwoo.com)。主站、后台 Worker、D1、私有 R2、Queues 和注册邮件服务已配置；线上验证范围与运维信息见 [部署记录](docs/canwoo-deployment.md)。源码仓库为 [YQ-Wang/canwoo](https://github.com/YQ-Wang/canwoo)。当前由本地部署，尚未配置自动发布。

## 研究助手工作流（2026-09-05）

新增按问题批量摘录、样本与独立页核查、论证审读、定向目录检索、选定页语义对读、资料变更后的增量续研，以及可复用研究方法。研究计划中可以直接管理、纠正、补录和导出摘录；原结果与修订依据保留。

入口是项目内「研究计划」→「新建研究计划」。详细范围、流程图、费用与真实 LED 铭文试跑中的分类问题见 [工作流与验证记录](docs/agentic-workflows.md)。新增核对工作台、人工方法评估、每批复核的大规模摘录、按意思查找、带 Word 脚注的写作、协作讨论及 IIIF / Zotero 附件导入，见 [生产力功能与边界](docs/productivity-workflows.md)。没有增加固定基础设施订阅。

## 基础工作台范围

2026-09-06：研究看板支持鼠标、键盘和菜单移动，共享保存排序与人工进度，并联动收件箱；移动不会绕过任务依赖或审读。证据摘录支持检索、来源/关系/待复核筛选、问题与来源对照、所选 CSV 导出，以及带固定版本引用的写作草稿。竞品取舍见 [研究工作流对照](docs/competitive-review-2026-09-06.md)。本轮 165 项测试全部通过；详细本地验收记录位于不随源码提交的 `work/task-board/` 与 `work/evidence-workspace/`。

已实现私人账户、项目、PDF / 照片 / 文本导入、R2 原件保存、数字 PDF 文本提取、逐页校订、资料与笔记的不可变版本、固定出处的证据卡、多厂商 BYOK、当前页 OCR 与项目 JSON 导出。本次加入六组研究工作台功能：

| 功能           | 当前行为                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 书目与正式引注 | 作者、纪年、版次、馆藏、档号、语言、权限等 CSL 元数据；修改历史；CSL JSON / BibTeX / RIS 预览导入与去重、导出；Chicago / APA 参考书目和带定位页码的 Chicago 脚注 |
| Zotero 入口    | 按页读取个人或群组文献库，勾选书目及已同步 PDF / 图片附件导入；key 不持久保存；不修改远端条目、不持续同步                                                       |
| 草稿与版本比较 | 校订和笔记即时保存到按账户、项目隔离的本机草稿；刷新后恢复；逐行差异；恢复旧版本产生新版本；引文所在页变更后待复核                                               |
| 精确证据定位   | 引用固定版本、文件页序、文字区间；照片 / PDF 页可框选原件区域；点击证据或论证内的引文返回准确位置；原书页码在书目脚注中另填                                      |
| 论证与来源脉络 | 独立研究问题、研究判断、竞争解释、下一步行动；关联支持 / 质疑 / 背景证据；记录转引、转载、翻译、共同来源及确认程度；保存检索范围、无命中和无法访问记录           |
| 后台研究与关注 | Queues 执行固定材料分析；D1 保存进度、结果、预算和状态；排队任务可暂停 / 继续 / 取消；结果不确定时仅人工新建重试；每日 / 每周 Crossref 关注、去重和待审收件箱    |

OCR 和模型分析需要有效 API key，支持 OpenAI、Anthropic、Google、OpenRouter。OCR 草稿经过人工核查后才另存为资料版本；模型分析和关注结果不会自动成为证据。模型始终由用户指定。

界面支持中文 / English 切换并记住语言偏好；未登录只展示账户页面，登录后才加载工作区导航。Canwoo 中文名为「参伍」。界面延续 Material 3 风格、Roboto 与系统中文字体，支持桌面 / 手机布局、项目搜索和排序、网格 / 列表、阅读专注模式。照片和 PDF 使用逐页预览，框选坐标相对原件页归一化。

当前边界：草稿只在当前浏览器，不是跨设备备份；预算覆盖后台研究、即时模型分析与语义检索，按配置或目录费率估算，不是厂商账单硬限额。研究关注只检查 Crossref 最新收录的前 20 条 DOI 元数据，覆盖不完整；不代表全网、档案馆或全部相关文献。收件箱在站内显示，不发送关注邮件。

Google 登录 / Drive 文件选择、团队角色、跨资料全文检索、后台任务及含原件的备份恢复已接入。语义检索当前针对文字，图片相似检索、Zotero 持续同步与动态引用域尚未实现；研究助手在选定资料与预算内运行，重要步骤仍需研究者审读。旧路线图中的历史状态请以当前代码及 [生产力功能与边界](docs/productivity-workflows.md) 为准。

## 架构

| 职责                             | 实现                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| 网站与 API                       | Cloudflare Workers，React + Vinext + shadcn                           |
| 账户与会话                       | Better Auth 开源库，数据位于 D1                                       |
| 项目、版本、引文、任务、模型配置 | D1 / SQLite                                                           |
| PDF 和照片原件                   | 私有 R2 bucket，经鉴权 API 读写                                       |
| 验证邮件、密码重置               | Cloudflare Email Sending 原生 EMAIL 绑定                              |
| 应用密钥、BYOK 加密主密钥        | Workers Secrets                                                       |
| 后台材料分析与定时关注           | Queues + 独立 Worker；Cron Triggers 每 15 分钟检查到期任务；D1 检查点 |

没有 Supabase、Vercel 或外部认证 SaaS 依赖。LLM 服务由用户的 BYOK 连接指定。

## 本地运行

需要 Node.js 22.19+。本地 D1/R2 由 Wrangler 模拟，无需 Cloudflare 账户。

```sh
npm ci
cp .env.example .dev.vars
```

在 `.dev.vars` 中分别填写随机生成的 `BETTER_AUTH_SECRET` 和 `FOLIOTRACE_ENCRYPTION_KEY`：

```sh
node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
```

两次生成不同的值。加密主密钥必须单独备份；直接替换会使已有 BYOK 密钥无法解密。不要将 `.dev.vars`、API key 或邮件 token 提交到 Git。

```sh
npm run db:migrate:local
npm run dev:cloudflare
```

打开 `http://127.0.0.1:3000`。Vite 同时加载主 Worker 和研究 Worker，队列生产者 / 消费者可在本地联调。Cron 不依赖打开网页；本地开发不会自动模拟真实定时触发，部署后由 Cron Triggers 执行。`AUTH_ALLOW_UNVERIFIED_LOCAL=1` 仅在 `BETTER_AUTH_URL` 的主机为 `localhost` 或 `127.0.0.1` 时允许不验证邮箱，公开域名仍要求验证。该本地选项不会发送注册邮件；本地密码重置需要邮件配置。

## 部署到自己的 Cloudflare 账户

1. 使用 `npx wrangler login` 登录自己的账户。生产目标为 `canwoo.com`，仓库为 `YQ-Wang/canwoo`；部署命令会修改该账号的资源。
2. 创建资源：

```sh
npx wrangler d1 create canwoo
npx wrangler r2 bucket create canwoo-originals
npx wrangler queues create canwoo-research
```

3. 将返回的真实 D1 `database_id` 同时填入 `wrangler.jsonc` 和 `wrangler.jobs.jsonc`，两者指向同一个 D1。保留 `DB` / `FILES` / `JOB_QUEUE` 绑定名。R2 bucket 保持私有，不开启公共访问。开发、预发布和生产应使用不同资源。
4. 配置 `BETTER_AUTH_URL` 和 `EMAIL_FROM`。生产配置为 `https://canwoo.com` 和 `noreply@canwoo.com`，`EMAIL` 绑定只允许这个发件地址；无需邮件 API token。执行 `npx wrangler email sending enable canwoo.com` 并检查 DNS 验证。向新用户发送注册邮件需要 Workers Paid，生产注册依赖实际可用的邮件投递。
5. 构建并配置部署环境的密钥：

```sh
npm run build:cloudflare
npx wrangler secret put BETTER_AUTH_SECRET --config dist/server/wrangler.json
npx wrangler secret put FOLIOTRACE_ENCRYPTION_KEY --config dist/server/wrangler.json
npx wrangler secret put FOLIOTRACE_ENCRYPTION_KEY --config wrangler.jobs.jsonc
```

**两个 Worker 的 `FOLIOTRACE_ENCRYPTION_KEY` 必须填写同一个值**，后台才能解密主站保存的模型连接。研究 Worker 不需要认证或邮件密钥。

`BETTER_AUTH_URL`、`EMAIL_FROM` 是非秘密配置，可放在 `wrangler.jsonc` 的 `vars`。`.dev.vars` 仅用于本地，不随部署上传。以上密钥命令会修改远端配置，应在选定正确账户和环境之后执行。

```sh
npm run db:migrate:remote
npm run deploy:jobs
npm run deploy:cloudflare
```

部署前需要确认域名、邮件、资源绑定与账户。不要使用临时预览账户作为正式数据存储。生产配置关闭 `workers.dev` 和预览地址，主站只绑定 `canwoo.com`；后台 Worker 不开放公共 HTTP 入口。

## 数据与安全约束

- 浏览器通过同源、HttpOnly cookie 会话访问 API。每个数据入口验证账户与项目归属；D1 不提供 Postgres RLS，不能依赖前端过滤作为权限控制。
- 原件只追加，下载先检查所属项目；上传成功后生成回执，资料登记只接受属于本用户和本项目的回执。上传与数据库登记跨两个服务，失败时可能留下孤立对象；需根据回执对账后清理。
- 资料版本与笔记不可覆盖。资料保存通过单条 SQL 比较预期版本，拒绝过期编辑；笔记的父版本唯一约束防止覆盖并发修改。
- 引文必须在固定版本的指定页中逐字出现。史料版本变更后，既有引文仍指向原版本，并显示待复核提示。
- BYOK 使用 AES-256-GCM，密文绑定用户 ID 和连接 ID。列表、项目导出均不包含明文或密文密钥。模型调用只发往四家预定义地址，不接受任意代理 URL。
- 后台分析先原子预留项目额度，同一请求 ID 和重复队列投递不会再次调用模型。最多 20 个未完成任务 / 账户；研究队列配置串行消费。当前页 OCR 使用独立即时调用接口，其每账户单活跃调用限制保留，且不纳入后台预算。
- 外部调用前保存检查点。准备阶段中断可安全重排；发送后失败或超时标为 `uncertain`，保留费用预留，禁止自动重放。研究者可以显式新建重试，但可能再次计费。运行中的外部请求不可撤回；暂停和取消仅作用于尚未调用的任务。
- 成功调用按返回 tokens 和用户费率结算；缺少用量时保留保守预留。费率可能过期，厂商特殊计费项未被覆盖，实际费用以厂商账单为准。
- 原件额度为每账户 500 MiB、全站 5,000,000,000 字节；先用 D1 单条条件 INSERT 原子预留，再写 R2，并发请求不会越过额度。上传失败或结果不确定时保留预留，需管理员对账后释放；原有未记录大小的回执按每份 20 MiB 保守计入。此额度仅覆盖本应用上传的原件，不是 Cloudflare 总账单硬上限。
- 上传限制 20 MiB，PDF 最多 500 页；单个转录版本 JSON 最多 1.8 MB（UTF-8），单页文本最多 10 万字符。每次分析最多 10 个版本、10 万字符，输出上限 4096 tokens。
- D1 单库容量和吞吐有限；大量档案的转录正文后续迁入 R2，仅在 D1 留页索引、版本和关系。需要按真实负载评估拆库与索引，而不是承诺无限规模。

## 验证

```sh
npm test
npm run typecheck
npm run lint
npm run build:cloudflare
npm run check:jobs
```

25 项测试使用独立 Miniflare / D1 验证账户隔离、固定引文与位置、并发版本、密钥上下文、Unicode 书目往返、预算原子预留、队列幂等、恢复后的执行权检查、结果不确定时不重复调用、关注去重和本机草稿隔离。厂商与 Crossref 测试使用请求替身，不花费真实 API 额度。

本地 HTTP 联调另验证了 Worker 内的五种书目导出、脚注与文件导入，以及实际 Queue 生产者 → 消费者 → 准备失败 → 释放预算 / 写入收件箱。浏览器检查覆盖草稿跨标签 / 刷新恢复、PDF 旧版本第二页与文字 / 框选定位、书目编辑与脚注、论证关联、版本比较和响应式布局。生产环境另验证了 HTTPS、认证健康、未登录访问拦截、跨站写入拒绝、页面资源、D1 读取及 Queue 消费；一封获授权的测试邮件已由收件人确认收到。真实用户注册与原件上传下载、Zotero key、收费模型调用仍需生产端到端验证，详情见部署记录。

`components/ui` 是生成的 shadcn 源码，不纳入应用 lint；仍参加 TypeScript 检查。本项目没有启用 React Compiler，因此未启用该编译器的限制性 lint 规则。

`drizzle/0000_*` 是生成的认证表迁移，`0001_research.sql` 与 `0002_workbench.sql` 是手写的研究数据迁移。`0003_storage_budget.sql` 增加原件额度预留。研究 SQL 迁移采用追加方式维护；不要重新生成并覆盖已经应用的迁移。上线前还需完成多浏览器回归、发信与有效模型 key 的联调，以及监控配置。当前为开发 alpha。

Material 界面改版已使用独立本地测试账户检查桌面（1280px）和手机（390px）布局，以及登录、项目搜索与空结果、排序、视图切换、创建项目弹窗、资料阅读、专注模式、未保存状态和撤销。测试资料明确标记为界面测试，未调用付费模型。

已知依赖审计项：当前审计剩余 4 项中等严重性告警，来自 Drizzle schema 生成工具链中的旧 esbuild。没有使用该工具启动开发服务器，且构建后的 Worker 不包含该工具链；不能据此宣称依赖审计完全无告警。

可选浏览器 WebMCP 只暴露当前账户可见项目的只读列表。已在本地浏览器中发现并调用 `foliotrace_list_projects`，返回了测试账户的三个项目；浏览器不支持该能力时不影响正常使用。

## 引注样式归属

`lib/citation-style.json` 封装了 [CSL 官方样式库的 Chicago notes and bibliography 样式](https://github.com/citation-style-language/styles/blob/master/chicago-notes-bibliography.csl)，作者 Andrew Dunning 及文件内列出的贡献者，按 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 使用。XML 内容保持原样，记录源文件 Git blob SHA `af4289099035133f51975bf133f235e85daf0eef`；这一许可证适用于该样式。Citation.js 提供 CSL 渲染和书目格式转换。

## 内测成本

目标是低用量时约 $5/月（另计税费、域名和超额用量）。Workers Paid 是账号级最低套餐，数据库与队列先用包含额度；R2 Standard 无固定月费，前 10 GB-month 免费，原件初始总额度设为 5 GB 留余量。定时关注每 15 分钟检查到期任务（约 2,880 次/月），仅对到期关注执行 Crossref 检索；队列并发为 1。LLM 和 OCR 使用用户自己的 API key，平台不提供共享付费模型。没有额外部署容器、向量数据库或付费搜索服务。

这些额度降低正常内测开销，不限制所有 Cloudflare 计费项目；D1 转录版本、请求量、日志和外部操作仍应查看账单。参考 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[R2 定价](https://developers.cloudflare.com/r2/pricing/)、[Email Service 定价](https://developers.cloudflare.com/email-service/platform/pricing/)。
