# dsh-theme-management-plugin

DeepSeek Harness Web GUI 的**主题与桌面宠物管理插件**：把「壁纸主题」和「卡通人物」做成可管理的资源——多主题、多宠物，支持**列表 / 新建 / 切换 / 编辑（弹窗）**。同一时刻只激活一个主题、只显示一个宠物，切换即替换。

内置默认示例：《灌篮高手》主题 + 樱木花道宠物（可随时新建自己的主题和宠物替换）。

## 功能

| 功能 | 说明 |
|---|---|
| 桌面主题 | 多主题（壁纸轮播 + 三栏透明磨砂 + 80% 磨砂控件），新建/切换，编辑弹窗：**主题名称（改动）**、**主题照片上传（添加）**、**删除主题** |
| 桌面宠物 | 多宠物（SVG 矢量角色，每小时换造型），新建/切换/开关/删除，编辑弹窗：**人物名称（替换）**、**人物形象上传（替换）**、**非互动状态语录（替换）**、**点按钮互动状态语录（替换）**、**背景音乐（开启/关闭/上传/删除）** |
| 互动按钮 | 宠物本体只保留 3 个互动按钮（摸头 / 传球 / 聊）+ 1 个隐藏按钮；上传入口全部收进设置里的编辑弹窗 |

## 目录结构

```
packages/pet/sakuragi/   # 双半区插件包 @deepseek-ai/dsh-sakuragi（host 状态机 + 路由 + browser UI）
assets/                  # 内置樱木花道角色包（character.json + poses/*.svg）
scripts/svg-transparent.mjs   # SVG 透明背景抠图脚本
SKILL.md                 # 完整操作手册
```

## 快速开始

```sh
# 1. 把 packages/pet/sakuragi 放进 deepseek-harness 源码仓库
# 2. 构建
pnpm exec tsc -b packages/pet/sakuragi
pnpm --filter @deepseek-ai/dsh-sakuragi run bundle
# 3. 安装为 profile 插件
pnpm dsh plugin --profile web add link:<checkout>/packages/pet/sakuragi
# 4. 重启
pnpm dsh web
```

完整说明见 [SKILL.md](./SKILL.md)。

## License

MIT
