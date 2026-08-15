# dsh-theme-management-plugin

DeepSeek Harness Web GUI 的**主题与桌面宠物管理插件**：把「壁纸主题」和「卡通人物」做成可管理的资源——多主题、多宠物，支持**列表 / 新建 / 切换 / 上传素材**。同一时刻只激活一个主题、只显示一个宠物，切换即替换。

内置默认示例：《灌篮高手》主题 + 樱木花道宠物（可随时新建自己的主题和宠物替换）。

## 功能

| 功能 | 说明 |
|---|---|
| 桌面主题 | 多主题（壁纸轮播 + 三栏透明磨砂 + 80% 磨砂控件），新建/切换，上传背景图 |
| 桌面宠物 | 多宠物（SVG 矢量角色，每小时换造型），新建/切换/开关，上传姿势图，聊天（本地人格 + 记忆） |
| 上传 | 宠物下方「上传」按钮：`.svg` → 角色姿势，其它图片 → 背景 |

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
