// 心动的生活 - 消除类游戏入口
import { GameEngine } from './core/game-engine';
import { CanvasRenderer } from './renderer/canvas-renderer';
import { InputHandler } from './renderer/input-handler';

/** 内测模式：dump 常开 + 显示导出日志按钮 */
const ALPHA_TEST = true;

function main(): void {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Cannot find #app container element');
  }

  // 1. Create core instances
  const engine = new GameEngine();
  const renderer = new CanvasRenderer();

  // 2. Initialize renderer (creates canvas inside container)
  renderer.init(container);

  // 3. Initialize input handler (attaches listeners to container)
  const inputHandler = new InputHandler(renderer);
  inputHandler.init(container);

  // 4. Start game and render initial state
  engine.start();

  // Alpha test mode: dump always on + show export button
  if (ALPHA_TEST) {
    engine.logger.dumpEnabled = true;
    renderer.dumpEnabled = true;
    renderer.showExportButton = true;
  }

  renderer.renderState(engine.getState());

  // 5. Wire up input callbacks

  inputHandler.onStagingClick((index: number) => {
    engine.selectPlate(index);
    renderer.renderState(engine.getState());
  });

  inputHandler.onCellClick(async (row: number, col: number) => {
    // Ignore clicks when game is over
    if (engine.isGameOver()) return;

    const oldScore = engine.getState().score;
    const result = engine.placePlate(row, col);

    if (result.success) {
      if (result.mergeSteps.length > 0) {
        await renderer.animateMerge(result.mergeSteps);
      }
      if (result.eliminations.length > 0) {
        await renderer.animateElimination(result.eliminations);
      }
      if (result.scoreGained > 0) {
        await renderer.animateScoreChange(oldScore, engine.getState().score);
      }
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

  // Expose logger download for debugging (press L key or call from console)
  // Press D to toggle dump mode (board snapshot after each placement)
  window.addEventListener('keydown', (e) => {
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
  // Also expose on window for console access
  (window as unknown as Record<string, unknown>).gameLogger = engine.logger;

  // 6. Handle window resize
  window.addEventListener('resize', () => {
    renderer.resize();
    renderer.renderState(engine.getState());
  });
}

main();
