# 品牌与公开联系信息 · 2026-09-05

公开支持地址统一由 `lib/platform-contact.ts` 提供：`support@canwoo.com`。隐私页、账号设置的用量与数据页、账号删除完成页均使用同一地址；系统通知沿用 `noreply@canwoo.com`。注册身份、项目成员及用户资料中的邮箱不改写。

CanwooBrand 统一登录页、工作区和隐私页的字标。最新版本采用 Google Sans Flex 500 英文字标与 Noto Sans SC SemiBold 600「参伍」，图形由两条开放曲线构成柔和的 W（见 [品牌标识](cw-brand.md)）。英文子集为 2,768 字节，双字中文字库为 2,080 字节，均随站点托管；中文在桌面降为 14px 的次级标签，手机为 13px。主界面继续使用 Geist。旧版 Manrope、宋体及其他历史资产保留供缓存客户端使用。详见 [当前视觉系统](saas-visual-system.md)。

视觉方向参考 Airbnb 与 Anthropic 的简洁图形及克制排版，图形为原创。英文字体来自官方发布的 [Google Sans Flex](https://design.google/library/google-sans-flex-font)，字体文件与 SIL OFL 1.1 许可分别保存在 `public/brand/canwoo-google-sans.ttf` 和 `public/brand/GoogleSans-OFL.txt`，官方 Google Fonts 下载清单见 `work/brand-soft/font-manifest.json`。字体来源署名不表示品牌关联。

验证：桌面工作区与隐私页、390 px 手机页眉、中英文切换；类型检查、lint 和 Cloudflare 生产构建通过。应用源码、public 文件和生产客户端/服务端构建未检出原硬编码私人支持邮箱。

收到用户对收信转发的单独授权后，已启用 Cloudflare Email Routing；`support@canwoo.com` 转发到用户现有且已验证的收件箱。私人目的地址只保存在 Cloudflare 配置，不写入站点或仓库。Cloudflare 返回收信状态 `ready`、规则启用；未另发测试邮件，不将配置检查描述为收件端投递确认。

此前联系信息改版发布版本：`672b99c6-7eab-4b38-ab24-ef0b00bad816`。线上隐私页与账号删除页返回 200、使用平台联系地址；字库、页签图标与工作区 JS 均与本地构建一致，结果保存在 `work/brand/live-checks.json`。

最新品牌发布版本：`282c923b-af96-4cbf-8b9c-5923c80b4783`。字体、标识、favicon 和线上页面均已核对；详见 [当前品牌验证](cw-brand.md)。
