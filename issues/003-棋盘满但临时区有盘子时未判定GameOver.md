# Issue #003: 棋盘满但临时区有盘子时未判定 Game Over

## 状态：已修复 ✅

## Commit: `14c5c07`

## 问题描述

当玩家放置盘子后棋盘已满（无空格子），且没有触发消除，但临时区仍有未放置的盘子时，游戏未判定 Game Over，玩家无法继续操作也无法结束游戏。

## 根因分析

`GameEngine.placePlate()` 中的 Game Over 检查被包裹在 `stagingEmpty` 条件内：只有当临时区所有盘子都放完后才检查棋盘是否已满。这导致在一轮中途棋盘就已填满的情况下，Game Over 判定被跳过。

## 修复方案

将 Game Over 检查（`!board.hasEmptyCell()`）提升到与 `stagingEmpty` 同级：每次放置后都检查棋盘是否已满，不再依赖临时区是否清空。

## 修改文件

- `src/core/game-engine.ts` — `placePlate()` 方法中的 Game Over 判定逻辑
