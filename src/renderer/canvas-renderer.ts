import type { GameState, IRenderer, MergeStep, EliminationEvent, Plate, GlassType } from '../types';

/** Color palette for glass types */
const GLASS_COLORS = [
  '#FF6B6B', // 0: red
  '#4ECDC4', // 1: teal
  '#45B7D1', // 2: blue
  '#96CEB4', // 3: green
  '#FFEAA7', // 4: yellow
  '#DDA0DD', // 5: plum
  '#FF8C42', // 6: orange
  '#98D8C8', // 7: mint
];

const BG_COLOR = '#1a1a2e';
const GRID_COLOR = '#16213e';
const CELL_EMPTY_COLOR = '#0f3460';
const CELL_OCCUPIED_COLOR = '#1a1a3e';
const PLATE_COLOR = '#e0e0e0';
const PLATE_STROKE = '#aaa';
const TEXT_COLOR = '#eee';
const STAGING_BG = '#0f3460';
const STAGING_SELECTED = '#e94560';
const TARGET_LABEL_COLOR = '#ffd700';

/** Layout regions computed on resize */
export interface Layout {
  /** Device pixel ratio */
  dpr: number;
  /** Canvas CSS width */
  width: number;
  /** Canvas CSS height */
  height: number;
  /** Padding around content */
  padding: number;

  // Top info area
  infoY: number;
  infoHeight: number;

  // Board area
  boardX: number;
  boardY: number;
  cellSize: number;
  boardWidth: number;
  boardHeight: number;

  // Staging area
  stagingY: number;
  stagingCellSize: number;
  stagingX: number;
}

export class CanvasRenderer implements IRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement | null = null;
  private layout: Layout | null = null;
  private lastState: GameState | null = null;

  init(container: HTMLElement): void {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get Canvas 2D context');
    }
    this.ctx = ctx;
    this.resize();
  }

  destroy(): void {
    if (this.canvas && this.container) {
      this.container.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.layout = null;
  }

  resize(): void {
    if (!this.canvas || !this.ctx || !this.container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = Math.max(8, w * 0.03);
    const infoHeight = Math.max(60, h * 0.12);
    const stagingHeight = Math.max(60, h * 0.15);
    const boardAvailH = h - infoHeight - stagingHeight - padding * 4;
    const boardAvailW = w - padding * 2;

    // We'll compute cellSize once we know board dimensions (default 6×4)
    // Store partial layout; renderState will finalize with actual board dims
    this.layout = {
      dpr,
      width: w,
      height: h,
      padding,
      infoY: padding,
      infoHeight,
      boardX: 0,
      boardY: infoHeight + padding * 2,
      cellSize: 0,
      boardWidth: 0,
      boardHeight: 0,
      stagingY: 0,
      stagingCellSize: 0,
      stagingX: 0,
    };

    // Compute cell size for default 6×4 board
    this.computeBoardLayout(6, 4, boardAvailW, boardAvailH);
  }

  renderState(state: GameState): void {
    if (!this.ctx || !this.layout) return;
    this.lastState = state;
    const ctx = this.ctx;
    const L = this.layout;

    // Recompute board layout if dimensions differ
    const boardAvailH = L.height - L.infoHeight - Math.max(60, L.height * 0.15) - L.padding * 4;
    const boardAvailW = L.width - L.padding * 2;
    this.computeBoardLayout(state.board.rows, state.board.cols, boardAvailW, boardAvailH);

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, L.width, L.height);

    this.drawInfoArea(ctx, L, state);
    this.drawBoard(ctx, L, state);
    this.drawStagingArea(ctx, L, state);

    if (state.gameOver) {
      this.drawGameOver(ctx, L, state);
    }
  }

  /** Expose the current layout for input hit-testing. */
  getLayout(): Layout | null {
    return this.layout;
  }

  /** Returns the restart button bounds (in CSS pixels) for hit-testing. */
  getRestartButtonBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.layout) return null;
    const L = this.layout;
    const btnW = Math.min(200, L.width * 0.45);
    const btnH = Math.max(40, L.height * 0.06);
    const btnX = (L.width - btnW) / 2;
    const btnY = L.height / 2 + L.height * 0.06;
    return { x: btnX, y: btnY, width: btnW, height: btnH };
  }

  async animateMerge(steps: MergeStep[]): Promise<void> {
    if (!this.ctx || !this.layout || !this.lastState || steps.length === 0) return;
    const ctx = this.ctx;
    const L = this.layout;
    const DURATION = 300;

    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / DURATION, 1);
        // Ease-out: flash bright then fade
        const alpha = t < 0.5 ? t * 2 : 2 - t * 2;

        // Re-render base state
        this.renderState(this.lastState!);

        // Draw overlay on source and target cells
        for (const step of steps) {
          const color = getGlassColor(step.glassType);
          for (const pos of [step.sourcePos, step.targetPos]) {
            const cx = L.boardX + pos.col * L.cellSize;
            const cy = L.boardY + pos.row * L.cellSize;
            ctx.fillStyle = color;
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillRect(cx, cy, L.cellSize, L.cellSize);
          }
        }
        ctx.globalAlpha = 1;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  async animateElimination(events: EliminationEvent[]): Promise<void> {
    if (!this.ctx || !this.layout || !this.lastState || events.length === 0) return;
    const ctx = this.ctx;
    const L = this.layout;
    const DURATION = 400;

    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / DURATION, 1);
        // Ease-out curve
        const ease = 1 - (1 - t) * (1 - t);
        const scale = 1 - ease;
        const alpha = 1 - ease;

        // Re-render base state
        this.renderState(this.lastState!);

        for (const event of events) {
          const { position, plate, reason } = event;
          const cx = L.boardX + position.col * L.cellSize;
          const cy = L.boardY + position.row * L.cellSize;
          const centerX = cx + L.cellSize / 2;
          const centerY = cy + L.cellSize / 2;

          // Scale-down + fade-out the plate
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(centerX, centerY);
          ctx.scale(scale, scale);
          ctx.translate(-centerX, -centerY);
          this.drawPlate(ctx, cx, cy, L.cellSize, plate);
          ctx.restore();

          // Show "+N" text for full_same_type eliminations
          if (reason === 'full_same_type') {
            const fontSize = Math.max(14, L.cellSize * 0.35);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Float upward as animation progresses
            const floatY = centerY - ease * L.cellSize * 0.5;
            ctx.fillText(`消除!`, centerX, floatY);
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  async animateScoreChange(oldScore: number, newScore: number): Promise<void> {
    if (!this.ctx || !this.layout || !this.lastState || oldScore === newScore) return;
    const DURATION = 500;

    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / DURATION, 1);
        // Ease-out
        const ease = 1 - (1 - t) * (1 - t);
        const displayScore = Math.round(oldScore + (newScore - oldScore) * ease);

        // Re-render with interpolated score
        const tempState = { ...this.lastState!, score: displayScore };
        this.renderState(tempState);

        // Pulse effect on score text
        if (t < 0.5) {
          const ctx = this.ctx!;
          const L = this.layout!;
          const fontSize = Math.max(12, Math.min(18, L.width * 0.04));
          const pulseScale = 1 + (0.5 - t) * 0.3;
          const x = L.padding;
          const y = L.infoY;

          ctx.save();
          ctx.fillStyle = '#FFD700';
          ctx.font = `bold ${fontSize * 1.4 * pulseScale}px sans-serif`;
          ctx.textBaseline = 'top';
          ctx.globalAlpha = 0.7;
          ctx.fillText(`分数: ${displayScore}`, x, y);
          ctx.restore();
        }

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          // Ensure final state is rendered with correct score
          this.lastState = { ...this.lastState!, score: newScore };
          this.renderState(this.lastState);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  // --- Private helpers ---

  private computeBoardLayout(rows: number, cols: number, availW: number, availH: number): void {
    if (!this.layout) return;
    const L = this.layout;

    const cellW = availW / cols;
    const cellH = availH / rows;
    const cellSize = Math.floor(Math.min(cellW, cellH));

    L.cellSize = cellSize;
    L.boardWidth = cellSize * cols;
    L.boardHeight = cellSize * rows;
    L.boardX = (L.width - L.boardWidth) / 2;

    // Staging area below board
    const stagingHeight = Math.max(60, L.height * 0.15);
    L.stagingY = L.boardY + L.boardHeight + L.padding;
    L.stagingCellSize = Math.min(cellSize, stagingHeight * 0.85);
    L.stagingX = (L.width - L.stagingCellSize * 3 - L.padding * 2) / 2;
  }

  private drawInfoArea(ctx: CanvasRenderingContext2D, L: Layout, state: GameState): void {
    const x = L.padding;
    const y = L.infoY;
    const fontSize = Math.max(12, Math.min(18, L.width * 0.04));

    ctx.textBaseline = 'top';

    // Score
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `bold ${fontSize * 1.4}px sans-serif`;
    ctx.fillText(`分数: ${state.score}`, x, y);

    // Round & round eliminations
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillText(`轮次: ${state.round}  本轮消除: ${state.roundEliminations}`, x, y + fontSize * 1.8);

    // Target glasses
    const targetY = y + fontSize * 3.2;
    ctx.fillStyle = TARGET_LABEL_COLOR;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText('目标酒杯:', x, targetY);

    const glassR = fontSize * 0.5;
    let gx = x + ctx.measureText('目标酒杯: ').width + glassR;
    for (const gt of state.targetGlasses) {
      ctx.fillStyle = getGlassColor(gt);
      ctx.beginPath();
      ctx.arc(gx, targetY + glassR, glassR, 0, Math.PI * 2);
      ctx.fill();
      gx += glassR * 2.5;
    }

    // Distance to next target refresh (default threshold = 10; GameState doesn't carry config)
    const DEFAULT_REFRESH_THRESHOLD = 10;
    const refreshDist = Math.max(0, DEFAULT_REFRESH_THRESHOLD - state.totalFullEliminations);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `${fontSize * 0.85}px sans-serif`;
    ctx.fillText(`刷新距离: ${refreshDist}`, gx + glassR, targetY);
  }

  private drawBoard(ctx: CanvasRenderingContext2D, L: Layout, state: GameState): void {
    const { boardX, boardY, cellSize } = L;
    const { rows, cols, cells } = state.board;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = boardX + c * cellSize;
        const cy = boardY + r * cellSize;
        const cell = cells[r]?.[c] ?? null;

        // Cell background
        ctx.fillStyle = cell ? CELL_OCCUPIED_COLOR : CELL_EMPTY_COLOR;
        ctx.fillRect(cx, cy, cellSize, cellSize);

        // Cell border
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cellSize, cellSize);

        if (cell) {
          this.drawPlate(ctx, cx, cy, cellSize, cell);
        }
      }
    }
  }

  private drawPlate(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, plate: Plate): void {
    const inset = size * 0.08;
    const px = x + inset;
    const py = y + inset;
    const ps = size - inset * 2;

    // Plate background (rounded rect)
    ctx.fillStyle = PLATE_COLOR;
    ctx.strokeStyle = PLATE_STROKE;
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, px, py, ps, ps, ps * 0.12);
    ctx.fill();
    ctx.stroke();

    // Draw glasses in 2 rows of 3
    const glassR = ps * 0.12;
    const gapX = ps / 3;
    const gapY = ps / 2;
    const offsetX = px + gapX / 2;
    const offsetY = py + gapY / 2;

    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const gx = offsetX + col * gapX;
      const gy = offsetY + row * gapY;

      if (i < plate.glasses.length) {
        const gt = plate.glasses[i]!;
        ctx.fillStyle = getGlassColor(gt);
        ctx.beginPath();
        ctx.arc(gx, gy, glassR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else {
        // Empty slot
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(gx, gy, glassR * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawStagingArea(ctx: CanvasRenderingContext2D, L: Layout, state: GameState): void {
    const { stagingY, stagingCellSize, stagingX, padding } = L;

    // Background bar
    ctx.fillStyle = STAGING_BG;
    ctx.fillRect(0, stagingY - padding * 0.5, L.width, stagingCellSize + padding);

    for (let i = 0; i < state.stagingArea.length; i++) {
      const plate = state.stagingArea[i];
      const sx = stagingX + i * (stagingCellSize + padding);
      const sy = stagingY;

      // Selection highlight
      if (state.selectedPlateIndex === i && plate) {
        ctx.strokeStyle = STAGING_SELECTED;
        ctx.lineWidth = 3;
        ctx.strokeRect(sx - 2, sy - 2, stagingCellSize + 4, stagingCellSize + 4);
      }

      if (plate) {
        this.drawPlate(ctx, sx, sy, stagingCellSize, plate);
      } else {
        // Empty staging slot
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sx, sy, stagingCellSize, stagingCellSize);
        ctx.setLineDash([]);
      }
    }
  }

  private drawGameOver(ctx: CanvasRenderingContext2D, L: Layout, state: GameState): void {
    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, L.width, L.height);

    const centerX = L.width / 2;
    const centerY = L.height / 2;

    // "游戏结束" title
    const titleSize = Math.max(28, L.width * 0.09);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${titleSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('游戏结束', centerX, centerY - L.height * 0.08);

    // Final score
    const scoreSize = Math.max(18, L.width * 0.055);
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${scoreSize}px sans-serif`;
    ctx.fillText(`最终得分: ${state.score}`, centerX, centerY);

    // Restart button
    const btn = this.getRestartButtonBounds()!;
    this.roundRect(ctx, btn.x, btn.y, btn.width, btn.height, btn.height * 0.25);
    ctx.fillStyle = '#e94560';
    ctx.fill();

    const btnFontSize = Math.max(16, btn.height * 0.45);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${btnFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('重新开始', btn.x + btn.width / 2, btn.y + btn.height / 2);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

function getGlassColor(type: GlassType): string {
  return GLASS_COLORS[type % GLASS_COLORS.length] ?? '#888';
}
