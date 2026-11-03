# macOS 签名与公证

三条打包路径分开使用，产物互不覆盖。应用标识继续使用 `app.agent.workbench`，不修改数据目录或钥匙串身份。

| 命令 | 用途 | 输出目录 |
| --- | --- | --- |
| `npm run package` | 本机 ad-hoc 签名 | `release/v<版本>/mac-arm64/`（Apple Silicon） |
| `npm run package:signed` | Developer ID 签名、Hardened Runtime；不公证 | `release/v<版本>/signed/mac-arm64/` |
| `npm run package:release` | Developer ID 签名、公证并装订票据；生成 arm64 DMG 和 ZIP，不上传 Release | `release/v<版本>/notarized/` |

## 前提

- 安装依赖并完成已有 HeroUI Pro 授权恢复：`npm ci`、`npm run heroui:setup`。
- 安装 Xcode Command Line Tools，确保 `xcrun --find notarytool` 可用。
- 登录钥匙串内有有效的 **Developer ID Application** 证书及其私钥。检查：

```bash
security find-identity -v -p codesigning
```

签名配置要求证书可用，不能静默跳过签名。多个证书时，可设置 `CSC_NAME` 为目标证书名称中的组织名称及 Team ID（不含 `Developer ID Application:` 前缀）。系统若弹出钥匙串授权，需用户本人核对并输入本机密码；不要关闭签名检查或重建钥匙串来绕过。

## 公证凭据

在本机终端交互式保存 Apple 公证凭据：

```bash
xcrun notarytool store-credentials athena-notary
```

请在 macOS「终端」或 iTerm 的交互式终端中执行，不要通过聊天命令执行器运行：当前本机 `notarytool 1.0.0 (38)` 在标准输入关闭时会以 133（SIGTRAP）崩溃；使用 PTY 时能正常显示输入提示。

若首先提示 `Path to App Store Connect API private key:`，使用 Apple ID 方式时直接按回车留空。随后按提示输入有公证权限的 Apple ID、对应 Team ID 和 App 专用密码（不是 Apple ID 登录密码）。App 专用密码在 <https://account.apple.com/> 的「登录和安全」中生成。凭据保存在钥匙串，不写入仓库、`.env` 或聊天。

```bash
export APPLE_KEYCHAIN_PROFILE=athena-notary
xcrun notarytool history --keychain-profile "$APPLE_KEYCHAIN_PROFILE"
npm run package:release
```

配置不存在、鉴权失败或公证失败时不能视为可分发产物。避免同时设置其他 `APPLE_ID` / `APPLE_API_*` 公证环境变量，它们在 electron-builder 内有优先级。指定非默认钥匙串时使用 `APPLE_KEYCHAIN`。

## 验证

签名目录生成后：

```bash
APP=release/v0.7.0/signed/mac-arm64/Athena.app
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP"
codesign -d --entitlements :- "$APP"
```

确认 Authority 为 Developer ID Application、TeamIdentifier 为预期团队，flags 包含 `runtime`，存在签名时间戳。签名后还需启动检查；签名校验不能替代运行验证。

完成公证后，将上面的 APP 路径换为 `notarized/mac-arm64/Athena.app`，再执行：

```bash
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=4 "$APP"
```

DMG 外层启用 Developer ID 签名。构建完成后，单独提交最终 DMG 并装订票据，再生成最终校验文件（ZIP 内已包含装订票据的 App）：

```bash
cd release/v0.7.0/notarized
xcrun notarytool submit Athena-0.7.0-mac-arm64.dmg --keychain-profile athena-notary --wait
# 仅在返回 Accepted 后继续
xcrun stapler staple Athena-0.7.0-mac-arm64.dmg
xcrun stapler validate Athena-0.7.0-mac-arm64.dmg
spctl --assess --type open --context context:primary-signature --verbose=4 Athena-0.7.0-mac-arm64.dmg
shasum -a 256 Athena-0.7.0-mac-arm64.dmg Athena-0.7.0-mac-arm64.zip > SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt
```

装订票据后文件哈希会变化；不要使用装订前的校验文件或更新元数据。当前没有自动更新，发布只上传最终 DMG、ZIP 和 `SHA256SUMS.txt`，不上传生成的 blockmap / latest-mac.yml。

`package:signed` 不包含公证票据，Gatekeeper 可能拒绝其运行。DMG/ZIP 生成、签名、公证、GitHub Release 上传与可下载性是不同阶段；本命令不会自动上传或配置自动更新。已发布的旧 ad-hoc 安装包不会因此变成正式签名包。

## 上传签名包到 GitHub Release

上传入口为 `scripts/upload-release.mjs`，使用直接声明的开发依赖 `semver` 进行版本比较，以及 macOS 自带的 `curl`、`git` 和签名工具，不依赖 `gh`。先完成最终 DMG 公证、装订和 SHA-256 文件生成。GitHub 身份使用私下配置的 `GH_TOKEN` / `GITHUB_TOKEN`，或已有的 GitHub git credential helper；需要目标仓库 Contents 写权限。不要把 Token 放进参数、源码、日志或聊天。

必须显式指定仓库。版本从 `package.json` 读取，默认目录为 `release/v<版本>/notarized/`；可用 `--directory` 指定目录。`--tag` 如有指定必须匹配项目版本。脚本只上传到**已存在、公开发布且非预发布**的 Release，不创建 Release、不移动标签、不推送源码、不修改 Release 文案。

上传前分页读取远端 Release，用 SemVer 找出最高正式版本，不按字符串或发布时间排序；忽略草稿、预发布、预发布版本标签及非 SemVer 标签。本地版本低于远端最高正式版本时拒绝上传；相同版本显示为更新现有资产，仍需 `--replace` 才能覆盖；更高版本仍要求目标 Release 已存在。当前上传流程只支持正式版本。

默认在交互终端中要求重新输入完整目标标签（例如 `v0.7.0`）。空输入、错误版本、Ctrl+C 或输入结束均取消，不会写入远端。确认的是已经构建并通过签名校验的版本，不是重命名或改版本工具；如果要发新版本，先更新 `package.json`、重建并完成公证，不能把旧包改名冒充新版本。非交互 CI 必须同时提供 `--yes --tag v<版本>`，其他安全检查不会跳过。`--dry-run` 不提示确认，也不写入远端。

```bash
# 只做本地签名/票据/哈希校验和远端只读检查，不上传。
npm run release:upload -- --repo Dylan-Nihilo/athena --replace --dry-run

# 没有同名资产时上传；已有资产会拒绝操作。
npm run release:upload -- --repo OWNER/REPOSITORY

# 确认替换已发布的同名安装包与校验文件。
npm run release:upload -- --repo OWNER/REPOSITORY --replace
# 随后输入提示中的完整标签，例如 v0.7.0；回车取消。

# CI：同时指定 --yes 与匹配当前构建的 --tag；不会跳过版本比较。
npm run release:upload -- --repo OWNER/REPOSITORY --replace --yes --tag v0.7.0
```

若 GitHub API 返回的实际仓库与 `--repo` 不同，默认直接拒绝上传，并显示实际仓库名。确认目标后才可加 `--allow-redirect`，不要为了绕过错误盲目加此参数；公开下载验证仍使用用户指定的 URL。脚本不修改 README 下载链接或 Git remote。

上传仅包含最终 DMG、ZIP 和 `SHA256SUMS.txt`。先校验 DMG 签名、票据及 Gatekeeper，再解压 ZIP 校验内部 App 的深度签名、票据、Gatekeeper、版本与应用标识。三个文件先用唯一临时名称上传，检查 GitHub 返回的大小及 SHA-256；全部通过后才将旧文件改名备份并切换新文件到正式下载名。随后通过**无登录凭据的公开链接**下载全部文件，重新比较 SHA-256，全部匹配后才删除旧备份。

失败不会自动重试写请求。恢复记录位于 `.runtime/release-upload-<唯一标识>.json`，包含仓库、标签和资产 ID，不含凭据。旧资产在公开下载验证成功前不会被删除，但切换中失败可能留下临时/备份名称；查看记录与 GitHub 当前资产，必要时先将旧备份恢复原名，不要不检查就重复运行。脚本也用 `.runtime/release-upload-<仓库标签哈希>.lock` 防止同一本地工作区并发；进程被强制终止留下锁时，先确认对应 PID 不再运行再人工删除锁。其他机器的并发发布不受此本地锁保护。

## 本次验证（0.7.0，Apple Silicon）

- App 公证 ID：`795e4eea-53f4-40f0-9bc2-2efd91c66b80`，Apple 返回 `Accepted`。
- 最终签名 DMG 公证 ID：`07922798-5609-4106-bc37-b896ed214b55`，Apple 返回 `Accepted`。
- App 与 DMG 票据装订及校验成功；ZIP 解压和 DMG 只读挂载后，内部 App 的深度签名、票据、Gatekeeper 均通过。
- 下载链接保持 `Dylan-Nihilo/athena`（GitHub 当前重定向到 `bitcat-ai/athena`）。经用户确认，已替换 `v0.7.0` 的 DMG、ZIP 和 `SHA256SUMS.txt`，版本标签不移动；源码推送到 `feat/apple-signing` 分支。
- 曾有一次 electron-builder 公证失败，提示找不到 `athena-notary`。随后同名凭据在前台、Node 子进程和后台的 `history` 查询，以及真实 `submit` 均成功，未能稳定复现最初失败，根因尚未确认。显式指定登录钥匙串的探针则失败；不能默认凭据就在登录钥匙串，不应因此重新创建或删除现有凭据。
- 恢复时复用已签名 App，手工提交并装订，然后用 `electron-builder --config scripts/electron-builder.release.cjs --prepackaged release/v0.7.0/notarized/mac-arm64/Athena.app --mac dmg zip --arm64 --publish never` 生成归档，避免重新签名。该命令需要设置 `APPLE_KEYCHAIN_PROFILE=athena-notary`；它跳过 App 签名和公证步骤，只能用于已独立验证的 App。

## 官方资料

- Apple Developer ID 证书：<https://developer.apple.com/help/account/certificates/create-developer-id-certificates/>
- Apple 公证：<https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>
- Electron 签名与公证：<https://www.electronjs.org/docs/latest/tutorial/code-signing>
- electron-builder macOS 配置：<https://www.electron.build/mac.html>
