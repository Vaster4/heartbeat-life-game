# 需求文档：新合并算法

## 简介

为消除类游戏「心动的生活」设计新的合并算法。新算法采用吸收模型，从指定放置位置出发，仅在新盘子的邻居范围内通过类型并集匹配构建参与组，然后按时间戳顺序执行吸收、剩余分配、消除和连锁检查。替代旧算法的全棋盘扫描和 BFS 方式。

## 术语表

- **Board（棋盘）**: rows × cols 的二维网格，每个格子可放置一个 Plate、障碍石或为空
- **Plate（盘子）**: 包含 0~6 个酒杯的容器，具有唯一 id 和放置时间戳 placedTimestamp
- **GlassType（酒杯类型）**: 用数字表示的酒杯种类（0 到 glassTypeCount-1）
- **Merge_Algorithm（合并算法）**: 实现 IMergeAlgorithm 接口的合并逻辑，入口为 resolve(board, placedPos)
- **Participation_Group（参与组）**: 从新盘子出发，通过类型并集匹配构建的一组相关盘子
- **Type_Pool（类型池）**: 参与组构建过程中维护的酒杯类型并集
- **Shared_Type（共享类型）**: 参与组内被 2 个及以上盘子持有的酒杯类型
- **Residual_Pool（剩余池）**: 吸收阶段中被挤出的非吸收类型酒杯的临时存放区
- **Absorption（吸收）**: 盘子选择一种共享类型，清空自身，收集该类型所有酒杯（上限 6）的过程
- **Chain_Check（连锁检查）**: 对接收了剩余分配且未被消除的盘子，递归执行完整合并流程
- **Empty_Elimination（空盘消除）**: 酒杯数为 0 的盘子被移除
- **Full_Elimination（满盘消除）**: 拥有 6 个相同类型酒杯的盘子被移除
- **Neighbor（邻居）**: 棋盘上与指定格子上下左右相邻的格子（四方向）
- **ResolutionResult（解析结果）**: 包含 mergeSteps、eliminations 和 isStable 的合并结果对象

## 需求

### 需求 1：合并算法入口

**用户故事：** 作为游戏引擎，我希望通过 resolve(board, placedPos) 调用合并算法，以便在放置盘子后触发合并流程。

#### 验收标准

1. WHEN 游戏引擎调用 resolve 并传入 Board 和新放置盘子的 CellPosition，THE Merge_Algorithm SHALL 返回一个 ResolutionResult 对象，包含 mergeSteps（合并步骤列表）、eliminations（消除事件列表）和 isStable 标志
2. THE Merge_Algorithm SHALL 实现 IMergeAlgorithm 接口
3. WHEN 新放置位置上的盘子不存在或酒杯数为 0，THE Merge_Algorithm SHALL 返回空的 mergeSteps 和 eliminations，且 isStable 为 true

### 需求 2：参与组构建

**用户故事：** 作为合并算法，我希望从新放置的盘子出发构建参与组，以便确定哪些盘子参与本次合并。

#### 验收标准

1. WHEN 构建参与组时，THE Merge_Algorithm SHALL 以新放置盘子 P 为起点，将 P 的所有四方向 Neighbor 中持有酒杯的盘子作为候选范围
2. THE Merge_Algorithm SHALL 初始化 Type_Pool 为盘子 P 的酒杯类型集合
3. WHEN 候选范围中存在与 Type_Pool 有交集的盘子，THE Merge_Algorithm SHALL 将该盘子加入参与组，并将该盘子的所有酒杯类型加入 Type_Pool
4. THE Merge_Algorithm SHALL 重复迭代候选范围，直到没有新成员可加入参与组
5. WHEN 参与组成员数少于 2，THE Merge_Algorithm SHALL 跳过该组的吸收和分配阶段

### 需求 3：吸收阶段

**用户故事：** 作为合并算法，我希望参与组内的盘子按规则吸收共享类型的酒杯，以便实现类型聚合效果。

#### 验收标准

1. THE Merge_Algorithm SHALL 将参与组内的盘子按 placedTimestamp 升序排列进行吸收
2. WHEN 一个盘子执行吸收时，THE Merge_Algorithm SHALL 从该盘子持有的、尚未被其他盘子吸收的 Shared_Type 中，选择在参与组内总数量最多的类型作为吸收类型
3. WHEN 盘子选定吸收类型后，THE Merge_Algorithm SHALL 清空该盘子的所有酒杯，将非吸收类型的酒杯挤出到 Residual_Pool
4. THE Merge_Algorithm SHALL 从参与组内所有盘子和 Residual_Pool 中收集所有吸收类型的酒杯，填入吸收盘子（上限 6 个）
5. WHEN 收集到的吸收类型酒杯数量超过 6，THE Merge_Algorithm SHALL 将溢出的酒杯放入 Residual_Pool
6. WHEN 盘子没有可选的未被吸收的 Shared_Type 时，THE Merge_Algorithm SHALL 跳过该盘子的吸收操作
7. WHEN 参与组内不存在 Shared_Type（被 2 个及以上盘子持有的类型），THE Merge_Algorithm SHALL 跳过整个吸收阶段，不产生合并步骤

### 需求 4：剩余分配

**用户故事：** 作为合并算法，我希望将剩余池中的酒杯分配给有空位的盘子，以便不浪费被挤出的酒杯。

#### 验收标准

1. WHEN Residual_Pool 中存在酒杯，THE Merge_Algorithm SHALL 按酒杯类型的数量降序依次分配
2. THE Merge_Algorithm SHALL 将酒杯填入参与组内有空位的盘子，优先填入空位最多的盘子
3. WHEN 多个盘子空位数相同，THE Merge_Algorithm SHALL 按 placedTimestamp 升序选择盘子
4. THE Merge_Algorithm SHALL 记录所有接收了剩余分配的盘子位置，用于后续连锁检查

### 需求 5：消除检查

**用户故事：** 作为合并算法，我希望在吸收和分配完成后检查并消除符合条件的盘子，以便推进游戏进程。

#### 验收标准

1. WHEN 参与组内某个盘子的酒杯数为 0，THE Merge_Algorithm SHALL 触发 Empty_Elimination，将该盘子从棋盘移除，并记录消除事件（reason 为 'empty'）
2. WHEN 参与组内某个盘子拥有 6 个相同类型的酒杯，THE Merge_Algorithm SHALL 触发 Full_Elimination，将该盘子从棋盘移除，并记录消除事件（reason 为 'full_same_type'）
3. THE Merge_Algorithm SHALL 对参与组内的每个盘子执行消除检查

### 需求 6：连锁检查

**用户故事：** 作为合并算法，我希望对接收了剩余分配的盘子递归执行合并，以便产生连锁反应增加游戏趣味性。

#### 验收标准

1. WHEN 剩余分配完成后，THE Merge_Algorithm SHALL 收集所有接收了剩余分配且未被消除的盘子作为连锁触发点
2. WHEN 存在连锁触发点，THE Merge_Algorithm SHALL 对每个触发点递归执行完整的合并流程（参与组构建 → 吸收 → 剩余分配 → 消除 → 连锁检查）
3. THE Merge_Algorithm SHALL 将递归产生的 mergeSteps 和 eliminations 累加到最终的 ResolutionResult 中

### 需求 7：递归终止保护

**用户故事：** 作为合并算法，我希望有递归深度限制，以便防止无限递归导致程序崩溃。

#### 验收标准

1. THE Merge_Algorithm SHALL 设置最大递归深度为 20
2. WHEN 递归深度达到最大值，THE Merge_Algorithm SHALL 停止递归并返回当前已累积的结果
3. WHEN 某次递归中参与组无法构建（成员数少于 2 或无共享类型），THE Merge_Algorithm SHALL 自然终止该分支的递归

### 需求 8：合并步骤记录

**用户故事：** 作为游戏渲染器，我希望获得详细的合并步骤信息，以便播放合并动画。

#### 验收标准

1. THE Merge_Algorithm SHALL 为每次酒杯转移生成 MergeStep 记录，包含 sourcePos（来源位置）、targetPos（目标位置）、glassType（酒杯类型）和 count（数量）
2. THE Merge_Algorithm SHALL 按合并发生的顺序记录所有 MergeStep

### 需求 9：算法局部性

**用户故事：** 作为游戏引擎，我希望合并算法只在新盘子的邻居范围内工作，以便提升性能并使合并行为更可预测。

#### 验收标准

1. THE Merge_Algorithm SHALL 仅将新放置盘子的四方向 Neighbor 作为参与组的候选范围，不扫描整个棋盘
2. THE Merge_Algorithm SHALL 使用类型并集迭代匹配构建参与组，不使用 BFS 遍历
3. WHEN 新放置盘子的邻居中没有持有酒杯的盘子，THE Merge_Algorithm SHALL 不执行任何合并操作

### 需求 10：酒杯守恒

**用户故事：** 作为游戏设计者，我希望合并过程中酒杯总数守恒（除消除外），以便保证游戏公平性。

#### 验收标准

1. THE Merge_Algorithm SHALL 在吸收和剩余分配阶段保持参与组内酒杯总数不变（不凭空创建或销毁酒杯）
2. WHEN 消除发生时，THE Merge_Algorithm SHALL 仅移除被消除盘子上的酒杯，不影响其他盘子的酒杯
