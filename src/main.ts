// 心动的生活 - 消除类游戏入口
import { GameEngine } from './core/game-engine';
import { CanvasRenderer } from './renderer/canvas-renderer';
import { InputHandler } from './renderer/input-handler';
import type { Plate, Cell } from './types';

/** 内测模式：由构建参数 ALPHA_TEST=true 控制 */
const ALPHA_TEST = __ALPHA_TEST__;

/** 编辑模式选中位置 */
type EditSelection =
  | { type: 'board'; row: number; col: number }
  | { type: 'staging'; index: number }
  | null;

/** 编辑模式状态 */
interface EditState {
  active: boolean;
  cells: (Plate | null)[][];
  staging: (Plate | null)[];
  selection: EditSelection;
  nextId: number;
}

function createEditState(): EditState {
  return {
    active: false,
    cells: [],
    staging: [],
    selection: null,
    nextId: 1,
  };
}

function clonePlate(p: Plate): Plate {
  return { id: p.id, glasses: [...p.glasses], placedTimestamp: p.placedTimestamp };
}

/** 获取当前选中的盘子引用 */
function getSelectedPlate(es: EditState): Plate | null {
  if (!es.selection) return null;
  if (es.selection.type === 'board') {
    return es.cells[es.selection.row]?.[es.selection.col] ?? null;
  }
  return es.staging[es.selection.index] ?? null;
}

/** 设置当前选中位置的盘子 */
function setSelectedPlate(es: EditState, plate: Plate | null): void {
  if (!es.selection) return;
  if (es.selection.type === 'board') {
    es.cells[es.selection.row]![es.selection.col] = plate;
  } else {
    es.staging[es.selection.index] = plate;
  }
}

function main(): void {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Cannot find #app container element');
  }

  const engine = new GameEngine();
  const renderer = new CanvasRenderer();
  renderer.init(container);

  const inputHandler = new InputHandler(renderer);
  inputHandler.init(container);

  engine.start();

  if (ALPHA_TEST) {
    engine.logger.dumpEnabled = true;
    renderer.dumpEnabled = true;
    renderer.showExportButton = true;
  }

  const editState = createEditState();

  function enterEditMode(): void {
    const state = engine.getState();
    editState.active = true;
    editState.cells = state.board.cells.map(row =>
      row.map((c: Cell) => c ? clonePlate(c) : null)
    );
    editState.staging = state.stagingArea.map(p => p ? clonePlate(p) : null);
    editState.selection = null;
    editState.nextId = 1;
    renderer.editMode = true;
    renderer.editSelection = null;
    renderEditState();
    console.log('[EDIT] 进入编辑模式 — 点击格子选中，数字键0-7添加酒杯，Backspace删除，Delete清空');
  }

  function exitEditMode(): void {
    editState.active = false;
    editState.selection = null;
    renderer.editMode = false;
    renderer.editSelection = null;
    engine.loadEditedState(editState.cells, editState.staging);
    renderer.renderState(engine.getState());
    console.log('[EDIT] 退出编辑模式，状态已加载');
  }

  function renderEditState(): void {
    const base = engine.getState();
    renderer.renderState({
      ...base,
      board: { rows: base.board.rows, cols: base.board.cols, cells: editState.cells },
      stagingArea: editState.staging,
      selectedPlateIndex: null,
      gameOver: false,
    });
  }

  // --- Input callbacks ---

  inputHandler.onStagingClick((index: number) => {
    if (editState.active) {
      // 选中临时区槽位，空的话自动创建空盘子
      if (!editState.staging[index]) {
        editState.staging[index] = { id: `edit-${editState.nextId++}`, glasses: [], placedTimestamp: null };
      }
      editState.selection = { type: 'staging', index };
      renderer.editSelection = { type: 'staging', index };
      renderEditState();
      return;
    }
    engine.selectPlate(index);
    renderer.renderState(engine.getState());
  });

  inputHandler.onCellClick(async (row: number, col: number) => {
    if (editState.active) {
      // 选中棋盘格子，空的话自动创建空盘子
      if (!editState.cells[row]![col]) {
        editState.cells[row]![col] = { id: `edit-${editState.nextId++}`, glasses: [], placedTimestamp: null };
      }
      editState.selection = { type: 'board', row, col };
      renderer.editSelection = { type: 'board', row, col };
      renderEditState();
      return;
    }
    if (engine.isGameOver()) return;

    const oldScore = engine.getState().score;
    const result = engine.placePlate(row, col);
    if (result.success) {
      if (result.mergeSteps.length > 0) await renderer.animateMerge(result.mergeSteps);
      if (result.eliminations.length > 0) await renderer.animateElimination(result.eliminations);
      if (result.scoreGained > 0) await renderer.animateScoreChange(oldScore, engine.getState().score);
    }
    renderer.renderState(engine.getState());
  });

  inputHandler.onRestartClick(() => {
    engine.reset();
    renderer.renderState(engine.getState());
  });

  inputHandler.onExportLogClick(() => {
    engine.logger.download(`game-log-${Date.now()}.txt`);
  });

  // --- Keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    // Edit mode: number keys add glass, Backspace removes, Delete clears
    if (editState.active) {
      const digit = parseInt(e.key, 10);
      if (digit >= 0 && digit <= 7) {
        const plate = getSelectedPlate(editState);
        if (plate && plate.glasses.length < 6) {
          plate.glasses.push(digit);
          renderEditState();
        }
        return;
      }
      if (e.key === 'Backspace') {
        const plate = getSelectedPlate(editState);
        if (plate) {
          plate.glasses.pop();
          if (plate.glasses.length === 0) {
            setSelectedPlate(editState, null);
            editState.selection = null;
            renderer.editSelection = null;
          }
        }
        renderEditState();
        return;
      }
      if (e.key === 'Delete') {
        setSelectedPlate(editState, null);
        editState.selection = null;
        renderer.editSelection = null;
        renderEditState();
        return;
      }
    }

    if (e.key === 'e' || e.key === 'E') {
      if (editState.active) exitEditMode();
      else enterEditMode();
      return;
    }
    if (e.key === 'Enter' && editState.active) {
      exitEditMode();
      return;
    }
    if (e.key === 'l' || e.key === 'L') {
      engine.logger.download(`game-log-${Date.now()}.txt`);
    }
    if (e.key === 'd' || e.key === 'D') {
      engine.logger.dumpEnabled = !engine.logger.dumpEnabled;
      renderer.dumpEnabled = engine.logger.dumpEnabled;
      const status = engine.logger.dumpEnabled ? '开启' : '关闭';
      engine.logger.info('DUMP', `棋盘快照模式: ${status}`);
      console.log(`[DUMP] 棋盘快照模式: ${status}`);
      renderer.renderState(engine.getState());
    }
  });

  (window as unknown as Record<string, unknown>).gameLogger = engine.logger;

  window.addEventListener('resize', () => {
    renderer.resize();
    renderer.renderState(engine.getState());
  });

  renderer.renderState(engine.getState());
}

main();
