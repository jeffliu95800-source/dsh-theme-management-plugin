---
name: dsh-theme-management-plugin
description: DeepSeek Harness Web GUI 的主题与桌面宠物管理插件：多主题（壁纸）与多宠物（SVG 卡通人物）的列表 / 新建 / 切换 / 上传素材，同一时刻只激活一个主题、只显示一个宠物。内置《灌篮高手》主题 + 樱木花道宠物作为默认示例。A theme & desktop-pet management plugin for the DSH Web GUI: list/create/switch/upload themes (wallpapers) and pets (SVG characters), one active at a time; ships Slam Dunk + Sakuragi as defaults.
---

# dsh-theme-management-plugin

DSH Web GUI 的**主题 + 桌面宠物管理插件**。把「壁纸主题」和「卡通人物」都做成可管理的资源：多主题/多宠物、列表、新建、切换、上传素材。**同一时刻只激活一个主题、只显示一个宠物**，切换即替换。

## 数据模型

所有资源存 `~/.dsh/slamdunk/`，纯目录即数据、零数据库：

```
~/.dsh/slamdunk/
├── pets/<id>/            # 每个宠物一个目录
│   ├── character.json    # 人设：name/bubbles(阶段台词)/reactions(摸头传球反应)/ranks(等级)/chat(聊天规则)/fallback/namePattern
│   └── poses/*.svg       # 姿势图（任意数量，整点每小时轮换）
├── themes/<id>/          # 每个主题一个目录
│   ├── theme.json        # { name }
│   └── backgrounds/*     # 壁纸图（任意数量，定时轮播）
├── active-pet.json       # 当前激活的宠物 id
└── active-theme.json     # 当前激活的主题 id
```

首次启动把内置 `sakuragi` 宠物（樱木花道）+ `default` 主题（空壁纸，回退内置 3 张）播种进目录。之后一切操作都是对这套目录的增删选择，**换宠物/换主题零代码**。

## 包结构（双半区，`dsh plugin add` 安装）

`packages/pet/sakuragi/`（`@deepseek-ai/dsh-sakuragi`）——一个包同时含 host 半区 + browser 半区：

- host：`service.ts`（状态机 + 多宠物/多主题激活 + 亲密度 + 持久化）、`pets.ts` / `themes.ts` / `character.ts` / `upload.ts`（目录管理 + 角色包加载 + 文件上传）、`routes.ts`（同源 HTTP API + 静态服务）、`index.ts`（apply，inject `['webServer']`）。
- browser：`src/client/`（`index.ts` 轮询 + 注册 `shell.overlay` 与 `settings.general.item`；`Pet.tsx` 渲染 + 拖拽 + 3D 倾斜 + 聊天 + 上传按钮；`SettingsRow.tsx` 皮肤管理面板）。
- `cordis.patch.yml`（`- insert: - id: sakuragi-pet, name: '@deepseek-ai/dsh-sakuragi'`）+ `package.json` 的 `dsh.bundle.patch` + `dsh.client`。

## API

| 方法/路径 | 作用 |
|---|---|
| `GET /api/sakuragi/state` | 激活宠物的状态（phase/bubble/poses/name/affinity） |
| `GET /api/sakuragi/pets` / `themes` | 列表 |
| `POST /api/sakuragi/pets/create` / `themes/create` | 新建（`{ name }`） |
| `POST /api/sakuragi/pets/activate` / `themes/activate` | 切换（`{ id }`） |
| `POST /api/sakuragi/upload?kind=background\|pose&name=...` | 上传（raw body）：背景→激活主题，姿势→激活宠物 |
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

## 主题表面改动（透明 + 磨砂，一次性）

插件本体管"数据"（壁纸/人物），而"表面透明 + 80% 磨砂"是 `packages/client/*` 的 CSS/TSX 改动（见旧版 `dsh-slamdunk-skin` skill 第 1 节），改动后需打包对应 client 包。核心模式：`background: transparent` 露出壁纸；控件用 `color-mix(in srgb, var(--token) 80%, transparent)` 做磨砂。

## 复用要点

- 换宠物 = 换 `pets/<id>/` 目录（character.json + poses）；换主题 = 换 `themes/<id>/` 目录（backgrounds）。均可经界面上传/新建完成。
- 同一时刻只有一个激活宠物（`active-pet.json`）、一个激活主题（`active-theme.json`）；`activate` 即替换。
- 上传姿势图 → 存激活宠物的 `poses/`，`service.reloadCharacter()` 立即生效；上传背景 → 存激活主题的 `backgrounds/`，AppFrame 30 秒内轮询到并切换。
- 聊天是本地人格引擎（关键词规则来自 character.json），记忆存 localStorage；接真 LLM 是后续项（host 加 `ctx.llm.stream()` 路由）。
- SVG 抠透明背景用 `scripts/svg-transparent.mjs`（浅灰路径删除 + viewBox 收紧）。
