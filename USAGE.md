# 使用文档（即插即用）

> `@jeffliu95800/dsh-sakuragi` — DeepSeek Harness Web GUI 的主题 + 桌面宠物管理插件。
> 装一个包，获得：多主题壁纸轮播（图片/视频）+ 多桌面宠物（SVG 角色，每小时换造型）+ 背景音乐 + 设置里的管理面板（新建/切换/编辑/删除）。

---

> **⚠️ 版权免责声明**：本插件内置的示例素材（卡通人物形象、背景音乐、壁纸图片）**版权归原作者 / 版权方所有**，仅用于功能演示，**请勿商用**。正式使用时请替换为你**原创或已获授权**的素材。

---

## 一、前置依赖（必备环境）

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | `^22.19` 或 `>=24` | dsh 运行环境 |
| pnpm | 任意近期版本 | 插件安装用 |
| deepseek-harness（dsh） | 已安装可运行 | 通过 `dsh --version` 确认 |
| Python3 + Pillow | （可选） | 仅在需要把照片转 SVG 时用到抠图脚本 |

> 无需额外「skill」——运行时零依赖其它技能。若你要**二次开发/复现**，参考 `SKILL.md`（AI 助手的操作手册）。

---

## 二、快速开始（3 步）

```sh
# 1. 安装插件（选一种方式，见下节）
dsh plugin --profile web add <安装源>

# 2. 启动
dsh web          # 或 dsh --profile web --port <端口>

# 3. 浏览器打开，硬刷新（Cmd+Shift+R）
```

装完打开 GUI 即看到：右下角宠物 + 壁纸轮播 + 设置 → 通用设置里的「桌面宠物 / 桌面主题」管理面板。

---

## 三、安装方式（三种，任选其一）

**方式 A：本地 .tgz（最简，无需 npm 账号）**
```sh
dsh plugin --profile web add /path/to/jeffliu95800-dsh-sakuragi-1.0.0.tgz
```

**方式 B：npm 包（发布后）**
```sh
dsh plugin --profile web add @jeffliu95800/dsh-sakuragi
```

**方式 C：本地 link（开发调试）**
```sh
dsh plugin --profile web add link:<checkout>/packages/pet/sakuragi
```

> 安装后会自动把包加进 profile 的 `dsh.profile.bundles`，无需手动改配置。
> 注意 CLI 顺序：`--profile` 是**全局** flag，要放在 `web` 之前（`dsh --profile web --port 3091`）；`dsh web` 本身是 `--profile web` 的别名，不能再带 `--profile`。

> **⚠️ 避坑（务必读）**：
> 1. **开发阶段不要写 scope 包名**——`@jeffliu95800/dsh-sakuragi` 在 `npm publish` 成功前不存在于 registry，`dsh plugin add @jeffliu95800/dsh-sakuragi` 会找不到 → **启动直接崩溃**。开发期只用「方式 C `link:`」或「方式 A `file:` .tgz」。
> 2. **`file:` 必须是绝对路径，且指向构建产物**（打包好的 `.tgz`，或含 `lib/` 的目录），**不要指向 `src/` 源码目录**（未构建，`main: lib/index.js` 找不到会崩）。
> 3. **只有真正 `npm publish --access public` 成功之后**，才可以用 scope 包名（方式 B）。

---

## 四、配置素材库模式（materialRoot，推荐）

默认数据在 `~/.dsh/slamdunk/`（pets/ + themes/ 分离）。想让「一个文件夹 = 一个主题+宠物组合」，配置素材库：

编辑 `~/.dsh/profiles/web/cordis.patch.yml`。完整内容备份如下（把 `materialRoot` 换成你自己的绝对路径）：

```yaml
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).

# Point the pet/theme plugin at the material library ("dsh theme" folder):
# every subfolder (灌篮高手/凡人修仙传/蜡笔小新/…) is one theme+character combo
# with model/ (poses), img/ (wallpapers), music/ (background music).
- id: sakuragi-pet
  config:
    materialRoot: '/Users/jeff/Documents/dsh/dsh theme'
```

> ⚠️ **这份配置曾被意外清空**（导致插件回退到 legacy 布局、素材库人物「消失」）。建议把上面完整内容单独存一份备份，避免丢失后误以为数据丢了。

素材库结构：
```
素材库/
├── 灌篮高手/
│   ├── model/*        # 宠物造型图（pose）
│   ├── img/*          # 壁纸（图片或视频）
│   └── music/*        # 背景音乐
├── 凡人修仙传/
│   └── ...
```

首次启动自动为每个子文件夹生成 `character.json` / `theme.json`；放入图片/视频后**无需重启**，壁纸 30 秒内自动轮询到、造型实时列目录。

---

## 五、图片规范

### 宠物造型（pose）
| 项 | 规范 |
|---|---|
| 格式 | **SVG（透明背景）**，也兼容 png/jpg/webp/gif |
| 命名 | 语义化，如 `pose_idle.svg` / `pose_waving.svg`（任意数量） |
| 轮换 | 按整点墙钟时间每小时自动换一张 |
| 目录 | legacy 布局 `poses/`；素材库布局 `model/` |

**照片 → 透明底 SVG**（可选，需 Python3）：
```sh
python3 scripts/vectorize.py <图片目录>      # 照片转扁平色矢量 SVG（flood-fill 抠背景）
python3 scripts/raster_svg.py <图片>         # 保留原始像素、只去白底，嵌成透明 PNG 的 SVG
python3 scripts/tighten_svg.py <in.svg> <out.svg>   # 收紧 viewBox + 去噪点
node scripts/svg-transparent.mjs <in.svg>    # 删 VTracer 的浅灰背景路径
```
> 原始照片请单独放一个 `_raw/` 目录，别和成品 SVG 混在一起。

### 主题壁纸（background）
| 项 | 规范 |
|---|---|
| 格式 | jpg / png / webp（静态轮播）；mp4 / webm / mov（视频壁纸） |
| 命名 | 任意，按文件名排序轮播 |
| 数量 | 任意多张，定时轮播 |
| 目录 | legacy `backgrounds/`；素材库 `img/` |

---

## 六、音视频规范

### 背景音乐
| 项 | 规范 |
|---|---|
| 格式 | mp3 / ogg / wav / flac / m4a / aac |
| 播放 | 宠物 `music.enabled=true` 时 `<audio loop>` 播放**整个列表**（一首结束自动下一首） |
| 目录 | `music/` |
| 注意 | 浏览器自动播放策略：页面需有一次用户点击后才会出声 |

### 视频壁纸
| 项 | 规范 |
|---|---|
| 格式 | mp4 / m4v / webm / ogv / mov |
| 播放 | `<video autoplay loop muted>`（静音循环） |
| 目录 | 和图片壁纸同目录（`img/` 或 `backgrounds/`），**不能放子文件夹** |

---

## 七、验证清单（装完逐条确认）

```sh
# host 半区（路由）
curl http://127.0.0.1:3091/api/sakuragi/state            # 200 JSON
curl http://127.0.0.1:3091/sakuragi/character.json       # 200 JSON
curl http://127.0.0.1:3091/api/sakuragi/pets             # 200 JSON

# browser 半区（前端资源）
curl -I http://127.0.0.1:3091/plugins/@jeffliu95800/dsh-sakuragi/client.js   # 200

# 静态资源（注意 legacy 是 poses/，素材库是 model/）
curl -I http://127.0.0.1:3091/sakuragi/pets/sakuragi/poses/pose_waving.svg  # 200 image/svg+xml
```

---

## 八、常见问题

| 问题 | 原因 / 解法 |
|---|---|
| 装完看不到宠物 | 硬刷新 `Cmd+Shift+R`；或重启 `dsh web`（新增 host 路由/roster 行需重启） |
| pose 404 | 路径写错：legacy 布局用 `poses/`，素材库模式才用 `model/` |
| 音乐不响 | 浏览器自动播放限制，先点一下页面任意处 |
| `dsh web --profile xxx` 报错 | `--profile` 是全局 flag，用 `dsh --profile xxx web` |
| 视频壁纸不播 | 确认文件直接放 `img/`（不放子文件夹），且扩展名是 mp4/webm/mov |
| 启动崩溃 / 找不到包 | 开发期别用 scope 包名安装；未 `npm publish` 前用 `link:` 或 `file:` |
| `file:` 装完就崩 | `file:` 必须指向绝对路径的 `.tgz`（或含 `lib/` 的目录），别指 `src/` 源码 |
