# dsh-theme-management-plugin

DeepSeek Harness Web GUI 的**主题与桌面宠物管理插件**：把「壁纸主题」和「卡通人物」做成可管理的资源——多主题、多宠物，支持**列表 / 新建 / 切换 / 编辑（弹窗）**。同一时刻只激活一个主题、只显示一个宠物，切换即替换。

内置默认示例：《灌篮高手》主题 + 樱木花道宠物（可随时新建自己的主题和宠物替换）。

## 功能

| 功能 | 说明 |
|---|---|
| 桌面主题 | 多主题（壁纸轮播 + 三栏透明磨砂 + 磨砂控件），新建/切换，编辑弹窗：**主题名称（改动）**、**主题照片上传（添加）**、**逐张删除壁纸**、**删除主题** |
| 桌面宠物 | 多宠物（SVG 矢量角色，每小时换造型），新建/切换/开关/删除，编辑弹窗：**人物名称（替换）**、**人物形象上传（替换）/ 逐张删除**、**非互动状态语录（替换）**、**点按钮互动状态语录（替换）**、**背景音乐（开启/关闭/上传/删除）** |
| 互动按钮 | 宠物本体只保留 3 个互动按钮（摸头 / 传球 / 聊）+ 1 个隐藏按钮；上传入口全部收进设置里的编辑弹窗 |

## 素材库模式（materialRoot）

插件默认从 `~/.dsh/slamdunk/` 读数据；也可配置指向一个「素材库文件夹」（如 `dsh theme`），文件夹里每个子文件夹 = 一个主题+卡通人物组合：

```
dsh theme/
└── 灌篮高手/
    ├── model/*          # 人物造型图（SVG/PNG…，宠物姿势）
    ├── img/*            # 主题壁纸
    ├── music/*          # 背景音乐（mp3/ogg/wav/flac…）
    └── 卡通人物设置.rtf   # 备注文档（插件会忽略）
```

配置方法：在 profile 的 `~/.dsh/profiles/web/cordis.patch.yml` 里给插件覆盖 config：

```yaml
- id: sakuragi-pet
  config:
    materialRoot: '/Users/jeff/Documents/dsh/dsh theme'
```

首次扫描时插件会为每个子文件夹自动生成 `character.json`（名称=文件夹名）与 `theme.json`；之后在设置里编辑/上传/删除都会直接写回这个文件夹。`model` 为空时宠物暂不显示形象，放入图片后刷新即出现（`img` 同理作用于壁纸，AppFrame 30 秒内轮询到）。

## 目录结构

```
packages/pet/sakuragi/   # 双半区插件包 @jeffliu95800/dsh-sakuragi（host 状态机 + 路由 + browser UI）
assets/                  # 内置樱木花道角色包（character.json + poses/*.svg）
scripts/                  # SVG/图片处理脚本（详见 SKILL.md）：svg-transparent.mjs / vectorize.py / raster_svg.py / tighten_svg.py / compose-3d.py
SKILL.md                 # 完整操作手册
```

## 快速开始

```sh
# 1. 把 packages/pet/sakuragi 放进 deepseek-harness 源码仓库
# 2. 构建
pnpm exec tsc -b packages/pet/sakuragi
pnpm --filter @jeffliu95800/dsh-sakuragi run bundle
# 2.5 打包成 .tgz（供分发/即插即用）
cd packages/pet/sakuragi && pnpm pack --pack-destination /tmp
# 3. 安装为 profile 插件
pnpm dsh plugin --profile web add link:<checkout>/packages/pet/sakuragi
# 4. 重启
pnpm dsh web
```

完整说明见 [SKILL.md](./SKILL.md)；**即插即用使用文档**（安装步骤、图片/音视频规范、验证清单）见 [USAGE.md](./USAGE.md)。

## 版权免责声明

本仓库提供的是**插件代码**，以 [MIT](./LICENSE) 许可开源。但仓库内置的示例素材——卡通人物形象（如樱木花道、流川枫、韩立等）、背景音乐、壁纸图片——**版权均归原作者 / 版权方所有**：

- 这些素材仅用于**功能演示**，不代表本仓库作者拥有其版权或已获得授权；
- 请勿将这些示例素材用于**任何商业用途**，由此产生的责任由使用者自行承担；
- 若相关版权方提出要求，本仓库将配合移除相关素材。

**建议**：正式使用时，请将 `assets/` 与素材库中的示例素材替换为你**原创或已获授权**的图片、音乐与角色形象。

## License

代码以 [MIT](./LICENSE) 许可发布；内置示例素材不在此许可范围内（见上）。
