# 实现计划：心动的生活 - 消除类游戏

## 概述

基于 TypeScript + Vite 技术栈，按照逻辑层→渲染层→集成的顺序逐步实现。先搭建项目结构和配置系统，再实现核心游戏逻辑（棋盘、合并、得分），最后实现渲染层和输入处理，完成整体集成。

## 任务

- [x] 1. 搭建项目结构与配置系统
  - [x] 1.1 初始化 Vite + TypeScript 项目，安装依赖（vitest, fast-check, capacitor）
    - 创建 `src/` 目录结构：`src/core/`（游戏逻辑层）、`src/renderer/`（渲染层）、`src/types/`（类型定义）、`tests/unit/`、`tests/property/`
    - 配置 `tsconfig.json` 严格模式、`vitest.config.ts`
    - _需求: 11.1_

  - [x] 1.2 定义核心类型与接口
    - 在 `src/types/` 中定义 `GlassType`、`Plate`、`Board`、`Cell`、`CellPosition`、`GameState`、`PlacementResult`、`MergeStep`、`EliminationEvent`、`RoundBonus` 等类型
    - 定义 `IGameEngine`、`IBoardState`、`IMergeAlgorithm`、`IScoreCalculator`、`IPlateGenerator`、`IRenderer`、`IInputHandler` 接口
    - _需求: 11.1, 11.2_

  - [x] 1.3 实现 GameConfig 配置系统
    - 实现 `src/core/config.ts`，包含所有默认值和校验逻辑
    - 不合法参数回退默认值并 `console.warn`
    - _需求: 10.1, 10.2, 10.3_

  - [ ]* 1.4 编写配置系统属性测试
    - **Property 14: 配置校验与回退正确性**
    - **验证: 需求 10.1, 10.3**

  - [ ]* 1.5 编写配置系统单元测试
    - 测试默认值验证、多组奖励阈值配置、各种不合法参数组合
    - _需求: 10.2, 7.4_

- [x] 2. 实现棋盘状态管理
  - [x] 2.1 实现 BoardState 类
    - 实现 `src/core/board.ts`，包含 `getCell`、`setCell`、`isEmpty`、`getNeighbors`、`hasEmptyCell`、`clone` 方法
    - 创建棋盘初始化逻辑（rows × cols 空网格）
    - _需求: 1.1, 1.2_

  - [ ]* 2.2 编写棋盘初始化属性测试
    - **Property 1: 棋盘初始化正确性**
    - **验证: 需求 1.1, 1.2**

  - [ ]* 2.3 编写棋盘状态单元测试
    - 测试 getCell、setCell、isEmpty、getNeighbors、hasEmptyCell 等方法
    - 测试边界情况：1×1 棋盘
    - _需求: 1.1, 1.2_

- [x] 3. 实现盘子生成与放置逻辑
  - [x] 3.1 实现 PlateGenerator 盘子生成器
    - 实现 `src/core/plate-generator.ts`，支持注入随机数生成器
    - 按配置生成指定数量的盘子，酒杯数量和类型随机
    - _需求: 2.1, 2.2, 2.3_

  - [ ]* 3.2 编写盘子生成属性测试
    - **Property 2: 盘子生成满足配置约束**
    - **验证: 需求 2.1, 2.2, 2.3**

  - [x] 3.3 实现盘子放置逻辑
    - 在 GameEngine 中实现 `selectPlate` 和 `placePlate` 方法
    - 放置成功时记录时间戳，放置到非空格子时拒绝操作
    - 临时区 3 个盘子全部放置后开启新轮次
    - _需求: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.4 编写放置操作属性测试
    - **Property 3: 放置操作正确性**
    - **验证: 需求 3.1, 3.2**
    - **Property 4: 放置时间戳单调递增**
    - **验证: 需求 3.3**

- [x] 4. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 5. 实现合并算法
  - [x] 5.1 实现 MergeAlgorithm 合并算法核心
    - 实现 `src/core/merge.ts`，包含 `resolveUntilStable` 方法
    - 扫描相邻盘子对，将同类型酒杯转移到时间戳更早的盘子（不超过 6 个上限）
    - 设置最大迭代次数上限防止无限循环
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 实现消除逻辑
    - 在合并算法中集成消除检查：空盘消除（0 分）、6 个同类型满盘消除（触发得分）
    - 消除后重新检查相邻盘子触发连锁反应，直到稳定态
    - _需求: 5.1, 5.2, 5.3_

  - [ ]* 5.3 编写合并算法属性测试
    - **Property 5: 合并方向与上限正确性**
    - **验证: 需求 4.2, 4.3**
    - **Property 6: 解析后棋盘达到稳定态**
    - **验证: 需求 4.4, 4.5, 5.3**
    - **Property 7: 消除条件正确性**
    - **验证: 需求 5.1, 5.2**

  - [ ]* 5.4 编写合并算法单元测试
    - 测试边界情况：1×1 棋盘合并、盘子只有 1 个酒杯时的合并、溢出处理（5+2）、连锁反应完整流程
    - _需求: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

- [x] 6. 实现得分系统
  - [x] 6.1 实现 ScoreCalculator 得分计算
    - 实现 `src/core/score.ts`，包含 combo 得分、目标酒杯翻倍、单轮额外奖励计算
    - _需求: 6.1, 7.1, 7.2, 8.2_

  - [x] 6.2 实现目标酒杯机制
    - 在 GameEngine 中实现目标酒杯的随机选择、得分翻倍、刷新逻辑
    - 累计满盘消除数达到阈值时重新选择目标酒杯并重置计数
    - _需求: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 6.3 编写得分系统属性测试
    - **Property 8: Combo 得分计算正确性**
    - **验证: 需求 6.1, 6.2**
    - **Property 9: 单轮额外奖励计算正确性**
    - **验证: 需求 7.1, 7.2, 7.3**
    - **Property 11: 目标酒杯得分翻倍**
    - **验证: 需求 8.2**

  - [ ]* 6.4 编写目标酒杯属性测试
    - **Property 10: 目标酒杯生成正确性**
    - **验证: 需求 8.1**
    - **Property 12: 目标酒杯刷新正确性**
    - **验证: 需求 8.3, 8.4**

  - [ ]* 6.5 编写得分系统单元测试
    - 测试 combo 得分、目标酒杯翻倍、单轮额外奖励、单次移动产生多个 combo 的完整流程
    - _需求: 6.1, 6.2, 7.1, 7.2, 8.2_

- [x] 7. 实现 GameEngine 游戏引擎
  - [x] 7.1 实现 GameEngine 核心逻辑
    - 实现 `src/core/game-engine.ts`，协调 BoardState、MergeAlgorithm、ScoreCalculator、PlateGenerator
    - 实现 `start`、`reset`、`selectPlate`、`placePlate`、`getState`、`isGameOver` 方法
    - 每次 Move 开始时重置 combo 计数，每轮开始时重置单轮消除计数
    - _需求: 3.4, 6.2, 7.3, 9.1, 9.2_

  - [ ]* 7.2 编写游戏结束条件属性测试
    - **Property 13: 游戏结束条件正确性**
    - **验证: 需求 9.1, 9.2**

  - [ ]* 7.3 编写游戏引擎集成测试
    - 测试完整游戏流程：开始→放置→合并→消除→得分→新轮次→游戏结束→重新开始
    - _需求: 3.4, 9.2, 9.4_

- [x] 8. 检查点 - 确保所有逻辑层测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 9. 实现渲染层
  - [x] 9.1 实现 IRenderer 渲染抽象接口和 CanvasRenderer
    - 实现 `src/renderer/canvas-renderer.ts`
    - 绘制棋盘网格、盘子、酒杯（使用不同颜色/形状区分类型）
    - 绘制临时摆放区、分数显示、目标酒杯显示、轮次消除计数
    - 根据屏幕尺寸自适应调整布局
    - _需求: 1.3, 2.4, 11.2, 11.3, 12.1, 12.2, 12.3_

  - [x] 9.2 实现合并/消除/得分动画
    - 实现 `animateMerge`、`animateElimination`、`animateScoreChange` 方法
    - Combo 消除时显示 combo 计数和获得的分数
    - 得分变化时以动画效果更新分数显示
    - _需求: 6.3, 12.4_

  - [x] 9.3 实现 Game Over 界面
    - 显示最终得分和 Game Over 提示
    - 提供重新开始按钮
    - _需求: 9.3, 9.4_

- [x] 10. 实现输入处理
  - [x] 10.1 实现 IInputHandler 输入抽象接口和适配器
    - 实现 `src/renderer/input-handler.ts`
    - 支持触摸操作（移动端）和鼠标点击操作（桌面端）
    - 处理临时区盘子选择和棋盘格子点击
    - _需求: 11.4_

  - [x] 10.2 集成输入处理与游戏引擎
    - 将 InputHandler 的回调连接到 GameEngine 的 `selectPlate` 和 `placePlate`
    - 每次操作后调用 Renderer 更新画面
    - _需求: 3.1, 11.4_

- [x] 11. 整体集成与入口文件
  - [x] 11.1 创建应用入口文件
    - 实现 `src/main.ts`，初始化 GameConfig、GameEngine、CanvasRenderer、InputHandler
    - 连接所有组件，启动游戏
    - 创建 `index.html`，包含 Canvas 容器
    - _需求: 11.1, 11.2_

  - [x] 11.2 配置 Capacitor 跨平台打包
    - 初始化 Capacitor 配置，支持 Android 和 iOS 打包
    - 预留渲染适配器扩展点
    - _需求: 11.5, 11.6_

- [x] 12. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了对应的需求编号以确保可追溯性
- 检查点任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
