# ClioForge 参伍

**面向研究者与 agent 的开源研究 IDE。**

ClioForge 参伍目前从历史与人文研究切入：保存原件、阅读批注、组织证据、撰写笔记，并让研究助手在指定材料与预算内处理任务。模型结果需要研究者审读，不能替代史料判断。

[在线使用](https://clioforge.com) · [English README](README.md) · [文档目录](docs/README.md)

项目原名 Canwoo。在线服务现为 clioforge.com，代码仓库为 YQ-Wang/ClioForge。项目与备份保持兼容，旧测试域名已停用。详见[更名与兼容说明](docs/clioforge-transition.md)。

## 功能

- PDF、照片、文本与 Google Drive 导入；保留原件与校订版本。
- 逐页高亮、批注和固定出处的证据摘录。
- 支持表格、绘图、LaTeX 的写作编辑器，版本比较与带引注导出。
- 研究问题、竞争解释、任务看板、助手讨论及待审结果。
- 多厂商自带模型密钥、预算估计、批量摘录与比较。
- [后台研究准备](docs/background-dossier.md)：逐份阅读、交叉质疑和带出处的报告，最后由研究者审读。
- 项目成员权限、含原件的备份恢复、中英界面和深浅主题。

## 本地运行

需要 Git 与 Node.js 22.19 或以上。本地使用 Cloudflare 模拟器，无需开通云账号。

```sh
git clone https://github.com/YQ-Wang/ClioForge.git clioforge
cd clioforge
npm ci
cp .env.example .dev.vars
```

分别生成两个随机值，填入 `.dev.vars` 的 `BETTER_AUTH_SECRET` 和 `FOLIOTRACE_ENCRYPTION_KEY`：

```sh
node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
npm run db:migrate:local
npm run dev:cloudflare
```

打开 http://127.0.0.1:3000 并注册本地账号。默认本地不发送真实邮件；AI、Google 登录与 Drive 需要另行配置。不要提交密钥，保管好加密主密钥。

## 当前边界

这是公开 Alpha，尚不代表机构级完整验收。重要材料请备份，模型结论请核查。语义检索目前针对文字；Zotero 不持续同步；文献关注只覆盖有限的 Crossref 元数据；预算不是厂商账单硬上限；本机草稿不是跨设备备份。

部署、开发、贡献规范以 [英文文档](docs/README.md) 为准。代码注释使用英文，中文界面和历史材料保留原语言。许可为 [AGPL-3.0-only](LICENSE)，第三方材料遵循[各自许可](THIRD_PARTY_NOTICES.md)。
