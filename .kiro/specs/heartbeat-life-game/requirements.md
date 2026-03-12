# 需求文档：心动的生活 - 消除类游戏

## 简介

本项目以微信小程序游戏《心动的生活》为灵感，在其核心消除玩法基础上加入了目标酒杯加分、combo 连击、单轮额外奖励等创新机制。玩家将带有酒杯的盘子放置到网格棋盘上，通过相邻盘子间同类型酒杯的合并与消除来获得分数。游戏使用 Web 技术栈（HTML5 + Canvas）实现核心逻辑，并通过 Capacitor 打包到移动端，实现跨平台运行。

## 术语表

- **Game（游戏系统）**：整个游戏应用的顶层系统，负责协调各子系统
- **Board（棋盘）**：由可配置行列数（默认6行4列）组成的网格，用于放置盘子
- **Cell（格子）**：棋盘中的单个位置，每个格子最多容纳1个盘子
- **Plate（盘子）**：放置在格子中的游戏单元，包含6个酒杯槽位
- **Glass（酒杯）**：盘子中的基本元素，具有特定类型
- **Glass_Type（酒杯类型）**：酒杯的分类，种类数量可配置
- **Slot（槽位）**：盘子中容纳酒杯的位置，每个盘子固定6个槽位
- **Staging_Area（临时摆放区）**：每轮发放的3个盘子的暂存区域
- **Round（轮次）**：从发放3个盘子到全部放置完毕的一个完整周期
- **Move（单次移动）**：玩家将1个盘子从临时摆放区放置到棋盘格子的操作
- **Merge（合并）**：相邻盘子间同类型酒杯转移到更早放置的盘子的过程
- **Elimination（消除）**：盘子满足消除条件后从棋盘移除的过程
- **Chain_Reaction（连锁反应）**：合并/消除后触发的后续合并/消除，直到棋盘稳定
- **Stable_State（稳定态）**：棋盘中任意相邻盘子之间不存在同类型酒杯的状态
- **Combo（连击）**：单次移动中连续消除满盘的计数
- **Target_Glass（目标酒杯）**：当前被选为目标的酒杯类型，消除时得分翻倍
- **Config（配置系统）**：管理所有可配置参数的子系统
- **Renderer（渲染器）**：负责将游戏状态绘制到 Canvas 的子系统

## 需求

### 需求 1：棋盘初始化

**用户故事：** 作为玩家，我希望游戏启动时看到一个空的网格棋盘，以便我可以开始放置盘子。

#### 验收标准

1. WHEN Game 启动时，THE Board SHALL 创建一个由 Config 指定行数和列数（默认6行4列）的空网格
2. THE Board SHALL 将所有 Cell 初始化为空状态（不包含任何 Plate）
3. THE Renderer SHALL 在 Canvas 上绘制完整的棋盘网格线和所有空 Cell

### 需求 2：盘子发放

**用户故事：** 作为玩家，我希望每轮获得3个随机盘子，以便我可以规划放置策略。

#### 验收标准

1. WHEN 新 Round 开始时，THE Game SHALL 生成3个新 Plate 并放入 Staging_Area
2. THE Game SHALL 为每个新 Plate 随机填充酒杯，酒杯数量在 Config 指定的最小值和最大值范围内（含边界值）
3. THE Game SHALL 从 Config 指定的 Glass_Type 集合中随机选择每个酒杯的类型
4. THE Renderer SHALL 在 Staging_Area 中显示3个待放置的 Plate 及其包含的 Glass

### 需求 3：盘子放置

**用户故事：** 作为玩家，我希望能将盘子放到棋盘的任意空格子中，以便我可以自由选择策略。

#### 验收标准

1. WHEN 玩家选择 Staging_Area 中的一个 Plate 并点击一个空 Cell 时，THE Game SHALL 将该 Plate 放置到该 Cell 中
2. WHEN 玩家尝试将 Plate 放置到已有 Plate 的 Cell 时，THE Game SHALL 拒绝该操作并保持当前状态不变
3. THE Game SHALL 为每个放置的 Plate 记录放置时间戳，用于合并时判断先后顺序
4. WHEN Staging_Area 中的3个 Plate 全部放置完毕时，THE Game SHALL 开启新 Round

### 需求 4：合并机制

**用户故事：** 作为玩家，我希望放置盘子后自动触发相邻盘子间的酒杯合并，以便我可以通过策略性放置来消除盘子。

#### 验收标准

1. WHEN 一个 Plate 被放置到 Cell 后，THE Game SHALL 检查该 Cell 上下左右四个方向的相邻 Cell
2. WHEN 当前 Plate 与相邻 Plate 存在同一 Glass_Type 的酒杯时，THE Game SHALL 将同类型酒杯合并到放置时间戳更早的 Plate 中
3. WHILE 目标 Plate 的酒杯总数加上待合并的同类型酒杯数量超过6个时，THE Game SHALL 只转移刚好使目标 Plate 达到6个酒杯的数量，剩余酒杯留在源 Plate 中
4. WHEN 一次合并完成后棋盘未达到 Stable_State 时，THE Game SHALL 继续执行合并检查，直到棋盘达到 Stable_State
5. THE Game SHALL 定义 Stable_State 为：棋盘中任意两个相邻 Plate 之间不存在同一 Glass_Type 的酒杯

### 需求 5：消除规则

**用户故事：** 作为玩家，我希望满足条件的盘子能被自动消除，以便我可以腾出空间并获得分数。

#### 验收标准

1. WHEN 一个 Plate 中的酒杯数量变为0时，THE Game SHALL 将该 Plate 从 Board 中消除，且不增加分数
2. WHEN 一个 Plate 中装满6个相同 Glass_Type 的酒杯时，THE Game SHALL 将该 Plate 从 Board 中消除并触发得分计算
3. WHEN 消除发生后导致棋盘状态变化时，THE Game SHALL 重新检查相邻盘子并触发 Chain_Reaction，直到达到 Stable_State

### 需求 6：得分规则 - Combo 加分

**用户故事：** 作为玩家，我希望单次移动中连续消除满盘能获得递增分数，以便我有动力规划连锁消除。

#### 验收标准

1. WHEN 单次 Move 触发的所有 Chain_Reaction 中第 N 个满盘被消除时，THE Game SHALL 为该次消除增加 N 分（第1个=1分，第2个=2分，第3个=3分，以此类推）
2. THE Game SHALL 在每次新 Move 开始时将 Combo 计数重置为0
3. THE Renderer SHALL 在消除发生时显示当前 Combo 计数和获得的分数

### 需求 7：得分规则 - 单轮额外奖励

**用户故事：** 作为玩家，我希望在一轮中消除足够多的满盘时获得额外奖励，以便我有动力在整轮中保持高效消除。

#### 验收标准

1. THE Game SHALL 在每个 Round 中累计统计满盘消除数量
2. WHEN 单个 Round 中累计满盘消除数达到 Config 指定的阈值时，THE Game SHALL 给予对应的额外奖励分数（默认：3个→+1分，6个→+5分，9个→+10分）
3. THE Game SHALL 在新 Round 开始时重置单轮满盘消除计数
4. THE Config SHALL 支持配置多组阈值和对应的奖励分数

### 需求 8：目标酒杯机制

**用户故事：** 作为玩家，我希望有目标酒杯类型的加分机制，以便游戏有更多策略深度。

#### 验收标准

1. WHEN Game 启动时，THE Game SHALL 从所有 Glass_Type 中随机选择 Config 指定数量（m）的 Target_Glass 类型
2. WHEN 消除的满盘 Plate 包含的 Glass_Type 属于 Target_Glass 时，THE Game SHALL 将该次消除的得分乘以2
3. WHEN 累计消除任意类型的满盘数量达到 Config 指定的刷新阈值（默认10）时，THE Game SHALL 重新随机选择 Target_Glass 类型
4. THE Game SHALL 在重新选择 Target_Glass 后将累计满盘消除计数重置为0
5. THE Renderer SHALL 在界面上显示当前的 Target_Glass 类型

### 需求 9：游戏结束条件

**用户故事：** 作为玩家，我希望在棋盘填满时游戏结束，以便我知道何时需要重新开始。

#### 验收标准

1. WHILE Board 上存在至少1个空 Cell 时，THE Game SHALL 允许玩家继续放置 Plate
2. WHEN Board 上所有 Cell 均被 Plate 占据且没有空 Cell 时，THE Game SHALL 触发 Game Over
3. WHEN Game Over 触发时，THE Renderer SHALL 显示最终得分和 Game Over 界面
4. WHEN Game Over 界面显示时，THE Game SHALL 提供重新开始游戏的选项

### 需求 10：可配置参数系统

**用户故事：** 作为开发者，我希望游戏的关键参数可配置，以便后续方便调整难度和平衡性。

#### 验收标准

1. THE Config SHALL 支持配置以下参数：酒杯种类数量、新盘子酒杯数量范围（最小值和最大值）、目标酒杯数量 m、目标酒杯刷新阈值、单轮额外奖励的阈值与奖励分数列表、棋盘行数和列数
2. THE Config SHALL 为所有参数提供合理的默认值（酒杯种类数量=8，新盘子酒杯数量范围=1至4，目标酒杯数量=2，刷新阈值=10，棋盘=6行4列）
3. WHEN Config 中的参数值不合法时（如最小值大于最大值、行列数小于1），THE Config SHALL 回退到默认值并在控制台输出警告信息

### 需求 11：跨平台渲染与架构分层

**用户故事：** 作为玩家，我希望在手机和电脑上都能流畅游玩；作为开发者，我希望架构支持未来扩展到小程序平台。

#### 验收标准

1. THE Game SHALL 将游戏逻辑层与渲染层彻底分离：游戏逻辑层（棋盘状态、合并算法、得分计算等）不依赖任何 DOM、Canvas 或平台特定 API
2. THE Renderer SHALL 定义统一的渲染接口（抽象层），当前实现 HTML5 Canvas 适配器
3. THE Renderer SHALL 根据设备屏幕尺寸自适应调整棋盘和 UI 元素的大小
4. THE Game SHALL 支持触摸操作（移动端）和鼠标点击操作（桌面端）
5. THE Game SHALL 通过 Capacitor 打包后在 Android 和 iOS 设备上正常运行
6. THE Game 的架构 SHALL 预留渲染适配器扩展点，以便未来接入微信小程序、QQ 小程序、支付宝小程序等平台时只需实现对应的渲染适配器，无需修改游戏逻辑层

### 需求 12：游戏状态显示

**用户故事：** 作为玩家，我希望随时看到当前分数和游戏状态，以便我了解自己的游戏进度。

#### 验收标准

1. THE Renderer SHALL 在界面上持续显示当前总分数
2. THE Renderer SHALL 在界面上显示当前 Round 的满盘消除计数
3. THE Renderer SHALL 在界面上显示当前 Target_Glass 类型及其剩余刷新距离（距离下次刷新还需消除多少满盘）
4. WHEN 得分变化时，THE Renderer SHALL 以动画效果更新分数显示
