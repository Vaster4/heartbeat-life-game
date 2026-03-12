# 🍷 心动的生活 - 消除类游戏

以微信小程序游戏《心动的生活》为灵感，在其核心消除玩法基础上加入了**目标酒杯加分**、**Combo 连击**、**单轮额外奖励**等创新机制。使用纯 TypeScript + HTML5 Canvas 实现，支持跨平台运行。

## 📖 游戏规则

### 基本玩法

- 游戏棋盘为 **6 行 × 4 列** 的网格（可配置）
- 每轮发放 **3 个盘子** 到临时摆放区
- 每个盘子有 **6 个酒杯槽位**，新盘子随机填充 1~4 个酒杯（可配置）
- 玩家按任意顺序将盘子放置到棋盘的空格子中

### 合并机制

- 盘子放置后，自动检查上下左右四个方向的相邻盘子
- 若相邻盘子存在**同类型酒杯**，酒杯会合并到**放置时间更早**的盘子中
- 目标盘子最多容纳 6 个酒杯，超出部分留在源盘子中
- 合并会触发**连锁反应**，直到棋盘达到**稳定态**（任意相邻盘子间不存在同类型酒杯）

### 消除规则

- **空盘消除**：盘子中酒杯数量为 0 时自动消除，不得分
- **满盘消除**：盘子装满 6 个相同类型酒杯时消除并得分

### 得分系统

| 机制 | 规则 |
|------|------|
| Combo 连击 | 单次移动中第 N 个满盘消除得 N 分 |
| 目标酒杯 | 消除目标酒杯类型的满盘时得分 ×2 |
| 单轮奖励 | 一轮中消除满盘达到阈值时获得额外奖励（默认：3个→+1分，6个→+5分，9个→+10分） |

### 目标酒杯

- 游戏开始时随机选择 2 种目标酒杯类型（可配置）
- 每累计消除 10 个满盘后刷新目标酒杯（可配置）

### 游戏结束

- 当棋盘所有格子都被盘子占据、没有空格子时，游戏结束

## 🛠 技术栈

| 技术 | 用途 |
|------|------|
| **TypeScript** | 开发语言（严格模式） |
| **Vite** | 构建工具与开发服务器 |
| **HTML5 Canvas** | 游戏渲染 |
| **Capacitor** | 移动端打包（iOS / Android） |
| **Vitest** | 单元测试框架 |
| **fast-check** | 属性测试库 |

## 📁 项目结构

```
├── src/
│   ├── main.ts                      # 应用入口，组装各模块
│   ├── types/
│   │   └── index.ts                 # 所有类型定义与接口
│   ├── core/                        # 游戏逻辑层（零平台依赖）
│   │   ├── config.ts                # 配置系统（默认值 + 校验）
│   │   ├── board.ts                 # 棋盘状态管理
│   │   ├── plate-generator.ts       # 盘子生成器
│   │   ├── merge.ts                 # 合并算法（合并 + 消除 + 连锁反应）
│   │   ├── score.ts                 # 得分计算（Combo / 目标酒杯 / 轮次奖励）
│   │   └── game-engine.ts           # 游戏引擎（协调所有子系统）
│   └── renderer/                    # 渲染层
│       ├── canvas-renderer.ts       # HTML5 Canvas 渲染适配器
│       └── input-handler.ts         # 鼠标 / 触摸输入处理
├── tests/
│   ├── unit/                        # 单元测试
│   └── property/                    # 属性测试（fast-check）
├── index.html                       # HTML 入口
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── capacitor.config.ts              # Capacitor 移动端配置
```

## 🏗 架构设计

项目采用**逻辑层与渲染层彻底分离**的架构：

```
┌─────────────────────────────────────────┐
│              表现层                      │
│  CanvasRenderer  │  InputHandler        │
├─────────────────────────────────────────┤
│            抽象接口层                    │
│    IRenderer     │  IInputHandler       │
├─────────────────────────────────────────┤
│             游戏逻辑层                   │
│  GameEngine → BoardState                │
│             → MergeAlgorithm            │
│             → ScoreCalculator           │
│             → PlateGenerator            │
│             → GameConfig                │
└─────────────────────────────────────────┘
```

游戏逻辑层不依赖任何 DOM、Canvas 或平台特定 API，未来扩展到微信小程序、QQ 小程序、支付宝小程序等平台时，只需实现对应的渲染适配器，无需修改游戏逻辑层。

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

浏览器访问 `http://localhost:5173` 即可开始游戏。

### 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 预览生产版本

```bash
npm run preview
```

## 🧪 测试

### 运行所有测试

```bash
npm test
```

### 监听模式（开发时使用）

```bash
npm run test:watch
```

### 测试覆盖

项目包含 70 个单元测试，覆盖以下模块：

| 模块 | 测试文件 | 测试数量 |
|------|----------|----------|
| 棋盘状态 | `tests/unit/board.test.ts` | 16 |
| 盘子生成器 | `tests/unit/plate-generator.test.ts` | 9 |
| 合并算法 | `tests/unit/merge.test.ts` | 8 |
| 得分计算 | `tests/unit/score.test.ts` | 10 |
| 游戏引擎 | `tests/unit/game-engine.test.ts` | 25 |
| 启动检查 | `tests/unit/setup.test.ts` | 2 |

## ⚙️ 可配置参数

所有关键游戏参数均可配置，方便后续调整难度和平衡性：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `boardRows` | 6 | 棋盘行数 |
| `boardCols` | 4 | 棋盘列数 |
| `glassTypeCount` | 8 | 酒杯种类数量 |
| `minGlassesPerPlate` | 1 | 新盘子最少酒杯数 |
| `maxGlassesPerPlate` | 4 | 新盘子最多酒杯数 |
| `slotsPerPlate` | 6 | 每个盘子槽位数 |
| `platesPerRound` | 3 | 每轮发放盘子数 |
| `targetGlassCount` | 2 | 目标酒杯数量 |
| `targetGlassRefreshThreshold` | 10 | 目标酒杯刷新阈值（累计满盘消除数） |
| `roundBonuses` | `[{3,1},{6,5},{9,10}]` | 单轮额外奖励（阈值→奖励分数） |

配置校验规则：
- 参数不合法时自动回退到默认值并在控制台输出警告
- 例如 `minGlassesPerPlate > maxGlassesPerPlate` 时两者均回退默认值

自定义配置示例（在 `src/main.ts` 中修改）：

```typescript
const engine = new GameEngine({
  glassTypeCount: 6,        // 减少酒杯种类，降低难度
  maxGlassesPerPlate: 3,    // 减少新盘子酒杯数
  targetGlassCount: 3,      // 增加目标酒杯数量
  roundBonuses: [
    { threshold: 2, bonus: 2 },
    { threshold: 5, bonus: 8 },
  ],
});
```

## 📱 跨平台部署

### Web 浏览器

直接 `npm run build` 后部署 `dist/` 目录到任意静态服务器即可。支持桌面和移动端浏览器。

### Android

```bash
# 1. 构建 Web 产物
npm run build

# 2. 添加 Android 平台（首次）
npm run cap:add:android

# 3. 同步 Web 产物到原生项目
npm run cap:sync

# 4. 在 Android Studio 中打开项目
npm run cap:open:android
```

### iOS

```bash
# 1. 构建 Web 产物
npm run build

# 2. 添加 iOS 平台（首次）
npm run cap:add:ios

# 3. 同步 Web 产物到原生项目
npm run cap:sync

# 4. 在 Xcode 中打开项目
npm run cap:open:ios
```

> iOS 打包需要 macOS 环境和 Xcode。

### 小程序平台（规划中）

架构已预留渲染适配器扩展点。未来接入微信/QQ/支付宝小程序时，只需：

1. 实现对应平台的 `IRenderer` 渲染适配器
2. 实现对应平台的 `IInputHandler` 输入适配器
3. 游戏逻辑层代码无需任何修改

## 📋 更新日志

### v0.1.0（2026-03-12）

- 初版发布：完整的消除游戏核心玩法
- 6×4 网格棋盘，盘子放置、合并、消除、连锁反应
- Combo 连击、目标酒杯加分、单轮额外奖励等得分机制
- HTML5 Canvas 渲染，支持鼠标和触摸操作
- Capacitor 跨平台打包支持（Web / Android / iOS）
- 所有关键参数可配置
- 70 个单元测试
- 修复酒杯颜色区分度不足的问题（[#001](issues/001-酒杯颜色区分度不足.md)）

## 📄 许可证

私有项目，仅供学习和个人使用。
