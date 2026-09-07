# 品牌与公开联系信息 · 2026-09-05

公开支持地址统一由 `lib/platform-contact.ts` 提供：`support@canwoo.com`。隐私页、账号设置的用量与数据页、账号删除完成页均使用同一地址；系统通知沿用 `noreply@canwoo.com`。注册身份、项目成员及用户资料中的邮箱不改写。

CanwooBrand 统一登录页、工作区和隐私页的字标。当前品牌采用原创泥金折扇、Google Sans Flex 的小写 `canwoo` 字形轮廓，以及齐伋体的「參伍」字形轮廓；繁体展示已在预览后确认。英文采用 `wght=460`、`opsz=48`、`ROND=20`、`wdth=100`、`GRAD=0`、`slnt=0`，字重适中偏轻，末端轻微柔化。经 HarfBuzz 保留原生字距后整体等比缩放，不单独拉伸字母。中英文字标均为固定 SVG，不请求字库；主界面继续使用 Geist 与系统中文无衬线字体。字体来源及 SIL OFL 1.1 许可见 [品牌标识](cw-brand.md)、`public/brand/GoogleSans-OFL.txt` 和 `public/brand/Qiji-OFL.txt`。此前 Newsreader 与马善政楷书的许可分别保留在 `public/brand/Newsreader-OFL.txt`、`public/brand/MaShanZheng-OFL.txt`；旧版字库保留供缓存客户端使用。详见 [当前视觉系统](saas-visual-system.md)。

此前的视觉方向参考 Airbnb 与 Anthropic 的简洁图形及克制排版。当前英文品牌使用官方发布的 [Google Sans Flex](https://design.google/library/google-sans-flex-font) 无衬线字形轮廓，替换此前的 Newsreader 衬线字标。早期字库与许可保留供缓存客户端使用。字体来源署名不表示品牌关联。

此前联系信息改版的验证：桌面工作区与隐私页、390 px 手机页眉、中英文切换；类型检查、lint 和 Cloudflare 生产构建通过。应用源码、public 文件和生产客户端/服务端构建未检出原硬编码私人支持邮箱。这些记录不代表后续中英文字标的验证结果。

收到用户对收信转发的单独授权后，已启用 Cloudflare Email Routing；`support@canwoo.com` 转发到用户现有且已验证的收件箱。私人目的地址只保存在 Cloudflare 配置，不写入站点或仓库。Cloudflare 返回收信状态 `ready`、规则启用；未另发测试邮件，不将配置检查描述为收件端投递确认。

此前联系信息改版发布版本：`672b99c6-7eab-4b38-ab24-ef0b00bad816`。线上隐私页与账号删除页返回 200、使用平台联系地址；字库、页签图标与工作区 JS 均与本地构建一致，结果保存在 `work/brand/live-checks.json`。

早期品牌发布版本：`282c923b-af96-4cbf-8b9c-5923c80b4783`。该次发布的字体、标识、favicon 和线上页面均已核对；后续品牌变更见 [品牌记录](cw-brand.md)。
