---
name: dsh-theme-management-plugin
description: DeepSeek Harness Web GUI 的主题与桌面宠物管理插件：多主题（壁纸）与多宠物（SVG 卡通人物）的列表 / 新建 / 切换 / 编辑（弹窗：名称/形象上传/语录/背景音乐；主题照片/名称/删除），同一时刻只激活一个主题、只显示一个宠物。内置《灌篮高手》主题 + 樱木花道宠物作为默认示例。A theme & desktop-pet management plugin for the DSH Web GUI: list/create/switch/edit themes (wallpapers) and pets (SVG characters) — pet edit modal covers name, pose upload, quotes, background music; theme edit modal covers photos, name, delete; one active at a time; ships Slam Dunk + Sakuragi as defaults.
---

# dsh-theme-management-plugin

DSH Web GUI 的**主题 + 桌面宠物管理插件**。把「壁纸主题」和「卡通人物」都做成可管理的资源：多主题/多宠物、列表、新建、切换、**编辑弹窗**。**同一时刻只激活一个主题、只显示一个宠物**，切换即替换。

## 数据模型

所有资源存 `~/.dsh/slamdunk/`，纯目录即数据、零数据库：

```
~/.dsh/slamdunk/
├── pets/<id>/            # 每个宠物一个目录
│   ├── character.json    # 人设：name/bubbles(阶段台词)/reactions(摸头传球反应)/ranks(等级)/chat(聊天规则)/fallback/namePattern/music.enabled
│   ├── poses/*.svg       # 姿势图（任意数量，整点每小时轮换）
│   └── music/*           # 背景音乐文件（开启时循环播放）
├── themes/<id>/          # 每个主题一个目录
│   ├── theme.json        # { name }
│   └── backgrounds/*     # 壁纸图（任意数量，定时轮播）
├── active-pet.json       # 当前激活的宠物 id
└── active-theme.json     # 当前激活的主题 id
```

首次启动把内置 `sakuragi` 宠物（樱木花道）+ `default` 主题（空壁纸，回退内置 3 张）播种进目录。之后一切操作都是对这套目录的增删选择，**换宠物/换主题零代码**。

## 素材库模式（materialRoot）

不配置时数据在 `~/.dsh/slamdunk/`（pets/ + themes/ 分离）；配置 `materialRoot` 后切换为「素材库」布局，**一个子文件夹 = 一个主题+宠物组合**（宠物和主题同名同文件夹）：

```
<materialRoot>/
└── 灌篮高手/
    ├── model/*          # 宠物造型（等价 legacy 的 poses/）
    ├── img/*            # 主题壁纸（等价 legacy 的 backgrounds/）
    ├── music/*          # 背景音乐（两种布局一致）
    └── 卡通人物设置.rtf   # 用户备注，插件忽略
```

- profile 配置：`~/.dsh/profiles/web/cordis.patch.yml` → `- id: sakuragi-pet / config: { materialRoot: '<文件夹绝对路径>' }`。
- 首次扫描（host 构造时 `ensureLibraryMeta`）为每个子文件夹补 `character.json`（名称=文件夹名）与 `theme.json`；`sakuragi` 文件夹只当宠物、`default` 只当主题，不互相补。
- 文件夹名即 id（中文可用，sanitize 保留 Unicode 字母/数字），资产 URL 直接含中文路径（浏览器自动百分号编码）。
- 编辑弹窗的上传/改名/删除都直接写回素材库文件夹（`model`/`img`/`music`）。
- `model`/`img` 为空时宠物无形象、壁纸回退内置；放入图片后**不用重启**：poses 每次实时列目录，壁纸 AppFrame 30 秒轮询。

## 包结构（双半区，`dsh plugin add` 安装）

`packages/pet/sakuragi/`（`@deepseek-ai/dsh-sakuragi`）——一个包同时含 host 半区 + browser 半区：

- host：`service.ts`（状态机 + 多宠物/多主题激活 + 亲密度 + 持久化 + 宠物/主题配置读写）、`pets.ts` / `themes.ts` / `character.ts` / `upload.ts`（目录管理 + 角色包加载 + 文件上传/删除）、`routes.ts`（同源 HTTP API + 静态服务）、`index.ts`（apply，inject `['webServer']`）。
- browser：`src/client/`（`index.ts` 轮询 + 注册 `shell.overlay` 与 `settings.general.item`；`Pet.tsx` 渲染 + 拖拽 + 3D 倾斜 + 聊天 + 音乐；`SettingsRow.tsx` 皮肤管理面板；`PetEditModal.tsx` / `ThemeEditModal.tsx` 编辑弹窗）。
- `cordis.patch.yml`（`- insert: - id: sakuragi-pet, name: '@deepseek-ai/dsh-sakuragi'`）+ `package.json` 的 `dsh.bundle.patch` + `dsh.client`。

## API

| 方法/路径 | 作用 |
|---|---|
| `GET /api/sakuragi/state` | 激活宠物的状态（phase/bubble/poses/name/affinity/music） |
| `GET /api/sakuragi/pets` / `themes` | 列表 |
| `POST /api/sakuragi/pets/create` / `themes/create` | 新建（`{ name }`） |
| `POST /api/sakuragi/pets/activate` / `themes/activate` | 切换（`{ id }`） |
| `POST /api/sakuragi/pets/config` / `themes/config` | 编辑弹窗配置（`{ id }`） |
| `POST /api/sakuragi/pets/rename` / `themes/rename` | 改名（`{ id, name }`） |
| `POST /api/sakuragi/pets/quotes` | 替换语录（`{ id, quotes: { bubbles?, reactions? } }`） |
| `POST /api/sakuragi/pets/music-toggle` | 背景音乐开关（`{ id, enabled }`） |
| `POST /api/sakuragi/pets/delete` / `themes/delete` | 删除（`{ id }`；删激活项自动回退内置） |
| `POST /api/sakuragi/music/delete` | 删除宠物的一首音乐（`{ id, name }`） |
| `POST /api/sakuragi/upload?kind=background\|pose\|music&id=...&name=...` | 上传（raw body）：背景→主题 `img/`（素材库）/`backgrounds/`（legacy），姿势→宠物 `model/`/`poses/`，音乐→宠物 `music/` |
| `GET /api/sakuragi/backgrounds` | 激活主题的背景 URL 列表（空则回退内置壁纸） |
| `GET /sakuragi/pets/<id>/...` / `themes/<id>/...` | 静态服务（前缀路由，逐段 sanitize 防穿越） |
| `GET /sakuragi/character.json` | 激活宠物的人设（客户端聊天规则） |

## 构建 + 安装

```sh
pnpm exec tsc -b packages/pet/sakuragi                      # 类型检查
pnpm --filter @deepseek-ai/dsh-sakuragi run bundle          # tsdown → lib/index.js + lib/client.js
pnpm dsh plugin --profile web add link:<checkout>/packages/pet/sakuragi   # 本地安装
# 发布 npm 后：dsh plugin --profile web add <npm 包名>
```

重启 `dsh web` + 硬刷新页面。

## 编辑弹窗（设置 → 通用设置）

- **桌面宠物 → 每个宠物行「编辑」**：人物名称（替换）、人物形象上传（只能上传替换，`image/*,.svg`）、非互动状态语录（bubbles 5 个阶段）、点按钮互动状态语录（reactions 4 条）、背景音乐（开启/关闭/上传/删除，`audio/*`）、删除卡通人物。文本字段点「保存」统一写入；上传/开关/删除即时生效。
- **桌面主题 → 每个主题行「编辑」**：主题名称（改动）、主题照片上传（添加，`image/*`）、删除主题。
- 宠物本体互动按钮固定为 3 个（摸头/传球/聊）+ 1 个隐藏；上传入口已从宠物上移除，全部收敛到编辑弹窗。
- 音乐播放：激活宠物 `music.enabled` 且存在音乐文件时，浏览器 `<audio loop>` 播放第一首；受浏览器自动播放策略限制，需页面有过一次用户交互后才会出声。

## 主题表面改动（透明 + 磨砂，一次性）

插件本体管"数据"（壁纸/人物），而"表面透明 + 80% 磨砂"是 `packages/client/*` 的 CSS/TSX 改动（见旧版 `dsh-slamdunk-skin` skill 第 1 节），改动后需打包对应 client 包。核心模式：`background: transparent` 露出壁纸；控件用 `color-mix(in srgb, var(--token) 80%, transparent)` 做磨砂。

## 复用要点

- 换宠物 = 换 `pets/<id>/` 目录（character.json + poses + music）；换主题 = 换 `themes/<id>/` 目录（backgrounds）。均可经编辑弹窗上传/改名/删除完成。
- 同一时刻只有一个激活宠物（`active-pet.json`）、一个激活主题（`active-theme.json`）；`activate` 即替换，删除激活项自动回退内置。
- 上传姿势图 → 存对应宠物 `poses/`（同名覆盖即"替换"），`reloadCharacter()` 立即生效；上传背景 → 存对应主题 `backgrounds/`，AppFrame 30 秒内轮询到并切换。
- 聊天是本地人格引擎（关键词规则来自 character.json），记忆存 localStorage；接真 LLM 是后续项（host 加 `ctx.llm.stream()` 路由）。
- SVG 抠透明背景用 `scripts/svg-transparent.mjs`（浅灰路径删除 + viewBox 收紧）。
