# Canwoo · Google Drive 配置 / Google Drive setup

本阶段只接入 Google Drive。每位研究者连接自己的 Google 账户，通过 Google Picker 选择要导入的资料。Canwoo 使用 `drive.file`，仅访问用户交给应用的文件。这个权限本身包含所选文件的写入能力；Canwoo 当前只执行读取和下载，不修改 Google Drive 原件。

Google Drive is the only cloud-drive integration in this release. Each researcher connects their account and selects files with Google Picker. The `drive.file` scope permits reading and modifying selected files; Canwoo implements only reads and downloads.

## Google Cloud 配置步骤

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建或选择 **Canwoo** 项目。以下凭据都必须来自同一个项目。
2. APIs & Services → Library：启用 **Google Drive API** 和 **Google Picker API**。
3. Google Auth Platform → Branding：填写 Canwoo、支持邮箱、开发者联系邮箱和应用网址 `https://canwoo.com`。Audience 选择 External；测试阶段把自己的 Google 账户加入 Test users。
4. Data Access：添加 `https://www.googleapis.com/auth/drive.file`。它是 Google 推荐的非敏感文件级权限。对外发布仍需满足 Google 的品牌/基础审核要求；测试授权可能到期，需要重新连接。不要添加整个云盘的权限。
5. Clients → Create client，选择 **Web application**。Authorized JavaScript origins 填 `https://canwoo.com`；Authorized redirect URIs 填以下完整地址：

   `https://canwoo.com/api/connections/callback/google`

6. 记录 Client ID 和 Client Secret。在 APIs & Services → Credentials 创建 **API key**，用于浏览器中的 Picker。设置 Application restrictions 为 **Websites**，允许 `https://canwoo.com/*` 和 `https://docs.google.com/*`；API restrictions 只允许 **Google Picker API** 和 **Google Drive API**。
7. IAM & Admin → Settings 中记录数字形式的 **Project number**，不是 Project ID。
8. 在 Cloudflare → Workers & Pages → **canwoo** → Settings → Variables and Secrets 添加：

   | 变量 | Google 对应值 | 存储方式 |
   | --- | --- | --- |
   | `GOOGLE_DRIVE_CLIENT_ID` | OAuth Client ID | Secret |
   | `GOOGLE_DRIVE_CLIENT_SECRET` | OAuth Client Secret | Secret |
   | `GOOGLE_PICKER_API_KEY` | 上一步限制来源的 API key | Secret 或变量；Picker 使用时会发到浏览器 |
   | `GOOGLE_CLOUD_PROJECT_NUMBER` | 数字 Project number | 变量 |

9. 保存并部署配置。在 Canwoo 的研究项目内打开 **研究平台 → Google Drive → 连接 Google Drive**。授权后回到项目选择文件导入。PDF、照片、文本、Google Docs / Sheets / Slides 均可选择；Google 原生文档导出为 PDF。每份文件上限 20 MiB，Google 原生文档导出还受 Google 的导出限制约束。

## English checklist

Enable Drive API and Picker API in one Google Cloud project. Configure OAuth Branding/Audience and the `drive.file` scope, add your test account, and create a Web application OAuth client with origin `https://canwoo.com` and the exact callback above. Create a website-restricted Picker API key allowing `https://canwoo.com/*` and `https://docs.google.com/*`, restricted to Drive API and Picker API. Configure the four Worker variables listed above using the same project's numeric project number. Connect from Research platform → Google Drive and choose files to import.

## 本地开发与凭据保护 / Local development and credentials

本地 OAuth client 可另加 origin `http://127.0.0.1:3000`、callback `http://127.0.0.1:3000/api/connections/callback/google` 和 Picker 网站限制 `http://127.0.0.1:3000/*`。本地变量放在已忽略的 `.dev.vars`；`BETTER_AUTH_URL` 使用本地 origin。不要提交密钥或把密钥贴进聊天。

Client Secret 和 refresh token 始终保留在服务器；refresh token 使用现有 `FOLIOTRACE_ENCRYPTION_KEY` 按账户绑定加密。Picker 需要的短期 access token 只通过登录且同源的请求返回，不写入浏览器持久存储。不要直接更换加密密钥，否则现有 BYOK 和云盘授权将无法解密。

Disconnect 删除 Canwoo 保存的授权和未完成 OAuth 状态，不删除已导入的资料。用户也可在 [Google 账户第三方连接](https://myaccount.google.com/connections) 撤销授权。

Client secrets and refresh tokens remain on the server. Only the short-lived access token needed by Picker reaches the authenticated browser, without persistent browser storage. Disconnect deletes stored authorization but retains imported project sources; access can also be revoked in Google account settings.

## 官方文档 / References

- [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Drive scopes and per-file access](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Picker setup and API key restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)
