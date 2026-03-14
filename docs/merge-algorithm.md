# 合并算法设计文档 — 吸收模型 v2

## 概述

本文档描述「心动的生活」游戏的核心合并算法。该算法在玩家放置盘子后触发，负责将相邻盘子中的共享类型酒杯进行聚合、消除，并处理连锁反应。

算法采用**吸收模型**：每个参与合并的盘子选择一种共享类型进行吸收，非吸收类型被挤出到剩余池，最后剩余池中的酒杯重新分配给有空位的盘子。

## 入口

```typescript
resolve(board: IBoardState, placedPos: CellPosition): ResolutionResult
```

- `board`：当前棋盘状态（可变引用，算法直接修改棋盘）
- `placedPos`：新放置盘子的坐标 `{row, col}`
- 返回值包含 `mergeSteps`（合并步骤列表）、`eliminations`（消除事件列表）、`isStable`（始终为 `true`）

`resolve` 内部调用 `resolveFrom(board, [placedPos], allSteps, allEliminations, depth=0)` 驱动整个流程。

## 核心流程

```
resolve(board, placedPos)
  └─ resolveFrom(board, [placedPos], depth=0)
       │
       │  对每个触发点 pos（去重）：
       │    ├─ 跳过空格子或酒杯数为 0 的盘子
       │    │
       │    ├─ 1. buildGroup(board, pos)        → 参与组
       │    │     若成员 < 2 → 跳过
       │    │
       │    ├─ 2. absorbAndDistribute(group)    → 吸收 + 剩余分配
       │    │     返回 { steps, residualReceivers }
       │    │
       │    ├─ 3. eliminateGroup(board, group)  → 消除检查
       │    │
       │    └─ 4. 连锁：residualReceivers 中未被消除的盘子
       │          → resolveFrom(board, nextTriggers, depth+1)
       │
       └─ depth >= 20 时终止递归
```

### resolveFrom 的去重机制

`resolveFrom` 维护一个 `processed` 集合（`Set<string>`，key 为 `"row,col"`）。对于每个触发点：
- 若已在 `processed` 中 → 跳过
- 否则加入 `processed`
- 构建参与组后，将参与组所有成员也加入 `processed`

这确保同一次 `resolveFrom` 调用中，一个盘子不会被多个触发点重复处理。

## 第一步：参与组构建 (buildGroup)

### 输入
- `center`：触发点位置（新放置的盘子或连锁触发的盘子）

### 算法

```
1. centerPlate = board.getCell(center)
   若 centerPlate 为空 → 返回空数组

2. group = [{ pos: center, plate: centerPlate }]

3. candidates = center 的四方向邻居中，持有酒杯（glasses.length > 0）的盘子

4. typePool = Set(centerPlate.glasses)   // 类型并集

5. 迭代匹配：
   changed = true
   while changed:
     changed = false
     从后往前遍历 candidates（倒序，方便 splice）：
       若 candidate 的任一酒杯类型 ∈ typePool：
         - 加入 group
         - 将 candidate 的所有酒杯类型加入 typePool
         - 从 candidates 中移除
         - changed = true

6. 返回 group
```

### 关键点

- **候选范围始终是 center 的一层邻居**，不会扩展到邻居的邻居
- **类型池是并集匹配**：候选 B 不需要直接与 center 共享类型，只要 B 与类型池有交集即可
- 例：P=[1,2], A=[2,3], B=[3,4]。A 与 P 共享 2 → A 加入，池={1,2,3}。B 与池共享 3 → B 加入
- 若参与组成员 < 2，后续阶段全部跳过

### 为什么不需要 BFS

每次操作后的稳定状态保证：任意两个相邻盘子之间不存在共同类型。因此新放置盘子时，只有新盘子与其邻居之间可能存在共同类型，不需要扫描更远的盘子。

## 第二步：吸收阶段 (absorbAndDistribute — 吸收部分)

### 前置计算

```
1. 记录分配前状态：before = Map<"row,col", glasses[]>

2. 找出共享类型：
   - 对每个盘子，统计其持有的去重类型集合
   - typeOwners = Map<GlassType, 持有该类型的盘子数>
   - sharedTypes = { t | typeOwners[t] >= 2 }

3. 若 sharedTypes 为空 → 返回空结果，不执行合并

4. 统计每种共享类型在参与组内的总数量（含重复）：
   sharedTypeCounts = Map<GlassType, number>

5. 按 placedTimestamp 升序排列参与组成员（最老的盘子优先）
```

### 吸收规则

按时间戳升序，每个盘子依次执行：

```
对每个盘子 m（按 ts 升序）：

  1. 选择吸收类型：
     - 遍历 m 当前持有的酒杯类型（去重）
     - 过滤：必须是共享类型 且 尚未被其他盘子吸收
     - 计算每种候选类型的"可用总量" = sharedTypeCounts[t] + residualPool[t]
     - 选择可用总量最大的类型作为 bestType
     - 若无候选 → 跳过该盘子

  2. 标记 bestType 为已吸收

  3. 挤出非吸收类型：
     - 遍历 m.plate.glasses
     - 非 bestType 的酒杯 → 加入 residualPool
     - 记录 m 自己的 bestType 数量 = myAbsorbCount

  4. 清空 m：m.plate.glasses = []

  5. 从其他盘子收走 bestType：
     - 遍历参与组内所有其他盘子
     - 移除其 glasses 中所有 bestType 酒杯
     - 累加到 totalCollected

  6. 从剩余池收走 bestType：
     - totalCollected += residualPool[bestType]
     - 删除 residualPool[bestType]

  7. 填入吸收盘子：
     - fill = min(totalCollected, 6)
     - m.plate.glasses = [bestType × fill]
     - overflow = totalCollected - fill
     - 若 overflow > 0 → residualPool[bestType] += overflow
```

### 吸收类型选择的细节

选择吸收类型时，"可用总量"的计算包含两部分：
- `sharedTypeCounts[t]`：初始统计的参与组内该类型总数（注意：这个值在吸收过程中不会更新）
- `residualPool[t]`：当前剩余池中该类型的数量（会随吸收过程动态变化）

这意味着先被吸收的盘子使用的是初始统计值，后续盘子的选择会受到剩余池变化的影响。

### 完整示例

```
棋盘布局：
  (0,0): A=[2,2]         ts=0 (新放置)
  (0,1): B=[1]           ts=4
  (1,0): C=[1,3,4,5,5,5] ts=5
  (1,1): D=[1,2,5,5,5,5] ts=1

假设 A 是新放置的盘子，B、C、D 是 A 的邻居。

参与组构建：
  typePool 初始 = {2}
  D=[1,2,5,5,5,5] 有类型 2 ∈ typePool → 加入，typePool = {2,1,5}
  B=[1] 有类型 1 ∈ typePool → 加入，typePool = {2,1,5}
  C=[1,3,4,5,5,5] 有类型 1 ∈ typePool → 加入，typePool = {2,1,5,3,4}
  参与组 = [A, B, C, D]

共享类型分析：
  类型 1: B有, C有, D有 → 3个盘子持有 → 共享 ✓ (总数: B1+C1+D1=3)
  类型 2: A有, D有 → 2个盘子持有 → 共享 ✓ (总数: A2+D1=3)  [注: A有2个type2]
  类型 5: C有, D有 → 2个盘子持有 → 共享 ✓ (总数: C3+D4=7)
  类型 3: 仅C有 → 不共享
  类型 4: 仅C有 → 不共享

按 ts 排序: A(ts=0), D(ts=1), B(ts=4), C(ts=5)

--- 吸收阶段 ---

A(ts=0):
  持有类型: {2}
  候选共享类型: {2}（未被吸收）
  可用总量: type2 = sharedTypeCounts[2](3) + residualPool[2](0) = 3
  选择 bestType = 2
  挤出: 无非type2酒杯
  myAbsorbCount = 2
  清空 A=[]
  从其他盘子收走 type2: D有1个type2 → D变为[1,5,5,5,5]
  totalCollected = 2(自己) + 1(D) = 3
  从剩余池收走: 0
  填入: min(3, 6) = 3 → A=[2,2,2]
  溢出: 0

D(ts=1):
  持有类型: {1, 5}
  候选共享类型: {1, 5}（type2已被A吸收）
  可用总量: type1 = 3 + 0 = 3, type5 = 7 + 0 = 7
  选择 bestType = 5（最多）
  挤出: type1×1 → residualPool = {1: 1}
  myAbsorbCount = 4
  清空 D=[]
  从其他盘子收走 type5: C有3个type5 → C变为[1,3,4]
  totalCollected = 4(自己) + 3(C) = 7
  从剩余池收走 type5: 0
  填入: min(7, 6) = 6 → D=[5,5,5,5,5,5]
  溢出: 1 → residualPool = {1: 1, 5: 1}

B(ts=4):
  持有类型: {1}
  候选共享类型: {1}（type2、type5已被吸收）
  可用总量: type1 = 3 + 1(剩余池) = 4
  选择 bestType = 1
  挤出: 无非type1酒杯
  myAbsorbCount = 1
  清空 B=[]
  从其他盘子收走 type1: C有1个type1 → C变为[3,4]
  totalCollected = 1(自己) + 1(C) = 2
  从剩余池收走 type1: 1 → totalCollected = 3
  residualPool = {5: 1}
  填入: min(3, 6) = 3 → B=[1,1,1]
  溢出: 0

C(ts=5):
  持有类型: {3, 4}
  候选共享类型: 无（3和4都不是共享类型）
  跳过

吸收阶段结束。
剩余池: {5: 1}
```

## 第三步：剩余分配 (absorbAndDistribute — 分配部分)

### 算法

```
1. remaining = residualPool 中 count > 0 的条目，按 count 降序排列

2. 对每种类型 (type, count)：
   left = count

   3. 将参与组成员按以下规则排序：
      - 空位数（6 - glasses.length）降序
      - 空位数相同时，placedTimestamp 升序

   4. 遍历排序后的盘子：
      - capacity = 6 - glasses.length
      - 若 capacity <= 0 → 跳过
      - fill = min(left, capacity)
      - 向盘子追加 fill 个该类型酒杯
      - left -= fill
      - 记录该盘子为 residualReceiver

5. residualReceivers 去重（同一盘子只记录一次）
```

### 接续上面的示例

```
剩余池: {5: 1}

参与组空位:
  A=[2,2,2]       → 3空
  D=[5,5,5,5,5,5] → 0空
  B=[1,1,1]       → 3空
  C=[3,4]         → 4空

按空位降序（空位相同按ts升序）:
  C(4空, ts=5), A(3空, ts=0), B(3空, ts=4), D(0空, ts=1)

type5 × 1 → C（空位最多）
C = [3, 4, 5]

residualReceivers = [C的位置]
```

## 第四步：消除检查 (eliminateGroup)

### 算法

```
对参与组内每个盘子 m：
  plate = board.getCell(m.pos)
  若 plate 为空 → 跳过

  若 plate.glasses.length == 0：
    → 空盘消除
    → 记录 EliminationEvent { reason: 'empty' }
    → board.setCell(m.pos, null)

  否则若 plate.glasses.length == 6 且所有酒杯类型相同：
    → 满盘消除
    → 记录 EliminationEvent { reason: 'full_same_type' }
    → board.setCell(m.pos, null)
```

### 接续示例

```
A=[2,2,2]         → 不消除
D=[5,5,5,5,5,5]   → 满盘消除 ✓（6个相同类型5）
B=[1,1,1]         → 不消除
C=[3,4,5]         → 不消除
```

## 第五步：连锁检查

### 算法

```
1. eliminatedKeys = 所有被消除盘子的 "row,col" 集合

2. nextTriggers = residualReceivers 中不在 eliminatedKeys 中的盘子

3. 若 nextTriggers 非空：
   → resolveFrom(board, nextTriggers, depth + 1)
   → 递归执行完整流程（参与组构建 → 吸收 → 剩余分配 → 消除 → 连锁）
```

### 接续示例

```
被消除: D
residualReceivers: [C]
C 未被消除 → nextTriggers = [C]

递归: resolveFrom(board, [C], depth=1)
  C=[3,4,5]
  C 的邻居中是否有盘子与 C 共享类型？
  → 取决于棋盘其他位置的布局
  → 若无共享类型，参与组 < 2，终止
```

## 合并步骤记录 (diffToSteps)

合并步骤不是在吸收过程中实时记录的，而是通过**对比分配前后的状态差异**生成：

```
1. 对参与组内每个盘子，计算 before 和 after 的每种类型数量差

2. 对于减少了某类型酒杯的盘子（source）：
   - diff = oldCount[type] - newCount[type]
   - 在参与组中找到增加了该类型酒杯的盘子（target）
   - gained = newCount[type] - oldCount[type]（在 target 上）
   - 生成 MergeStep { sourcePos, targetPos, glassType, count: min(diff, gained) }
   - 每个 (source, type) 只匹配第一个找到的 target
```

这种方式简化了记录逻辑，但可能不会为每一次微观转移都生成独立的 step。

## 稳定状态定义

合并完成后的稳定状态：棋盘上任意两个相邻盘子之间不存在共同酒杯类型。

## 酒杯守恒

吸收和剩余分配阶段保证参与组内酒杯总数不变（不凭空创建或销毁）。只有消除阶段会移除酒杯。

## 递归终止条件

算法在以下任一条件满足时终止：

1. **深度限制**：递归深度 >= 20（`MAX_DEPTH`）
2. **无触发点**：`nextTriggers` 为空（没有接收剩余分配的未消除盘子）
3. **自然终止**：触发点的参与组成员 < 2，或参与组内无共享类型

## 接口定义

```typescript
interface IMergeAlgorithm {
  resolve(board: IBoardState, placedPos: CellPosition): ResolutionResult;
}

interface ResolutionResult {
  mergeSteps: MergeStep[];
  eliminations: EliminationEvent[];
  isStable: boolean;
}

interface MergeStep {
  sourcePos: CellPosition;    // 酒杯来源位置
  targetPos: CellPosition;    // 酒杯目标位置
  glassType: GlassType;       // 转移的酒杯类型
  count: number;              // 转移数量
}

interface EliminationEvent {
  position: CellPosition;     // 被消除盘子的位置
  plate: Plate;               // 被消除盘子的快照（含消除时的酒杯状态）
  reason: 'full_same_type' | 'empty';
}
```

## 算法演变历史

| 版本 | 策略 | 问题 |
|------|------|------|
| v0.1 全局重分配 | 参与组内所有酒杯统一收集，按类型/时间戳重新分配 | 合并后盘子可能出现原本没有的类型 |
| v0.2 定向转移 | 逐对相邻盘子，共同类型从新→老转移 | pair-by-pair 有顺序依赖，3+ 盘子时无法全局归集 |
| v0.3 全局池化 | 所有酒杯收集到池中，按类型数量/时间戳重新分配 | BFS 参与组构建拉入无关盘子 |
| v1.0 吸收模型（当前） | 每个盘子选一种共享类型吸收，非共享类型挤出到剩余池 | — |

### 吸收模型相比旧算法的优势

| 维度 | 旧算法 | 吸收模型 |
|------|--------|---------|
| 入口 | `resolveUntilStable(board)` 全棋盘扫描 | `resolve(board, placedPos)` 指定位置 |
| 参与组 | BFS 扩展到多层邻居 | 仅新盘子的一层邻居 + 类型并集匹配 |
| 重分配 | 全局池化：所有酒杯收集后重新分配 | 吸收模型：每个盘子选一种共享类型吸收 |
| 连锁 | 外层循环直到稳定 | 剩余分配接收者递归触发 |
| 可预测性 | 低（全棋盘扫描，结果难以预测） | 高（局部操作，行为可推理） |
