import type { GameState, IRenderer, MergeStep, EliminationEvent, Plate, GlassType } from '../types';

/** Color palette for glass types */
const GLASS_COLORS = [
  '#FF4757', // 0: 红色
  '#2ED573', // 1: 绿色
  '#1E90FF', // 2: 蓝色
  '#FFA502', // 3: 橙色
  '#A855F7', // 4: 紫色
  '#FFD700', // 5: 金黄色 (原黄色 #FFDD59 与橙色过近)
  '#FF1493', // 6: 洋红色 (原粉色 #FF6B81 与红色过近)
  '#00D2D3', // 7: 青色
];

/** Shape types for each glass type to improve distinguishability */
type GlassShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'star' | 'heart' | 'pentagon';

const GLASS_SHAPES: GlassShape[] = [
  'circle',    // 0: 红色 - 圆形
  'square',    // 1: 绿色 - 方形
  'triangle',  // 2: 蓝色 - 三角形
  'diamond',   // 3: 橙色 - 菱形
  'hexagon',   // 4: 紫色 - 六边形
  'star',      // 5: 金黄色 - 星形
  'heart',     // 6: 洋红色 - 心形
  'pentagon',  // 7: 青色 - 五边形
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
  private isGameOver = false;

  /** 是否显示 dump 模式指示器 */
  dumpEnabled = false;

  /** 是否显示导出日志按钮（内测模式） */
  showExportButton = false;

  /** 是否处于编辑模式 */
  editMode = false;

  /** 编辑模式选中位置 */
  editSelection: { type: 'board'; row: number; col: number } | { type: 'staging'; index: number } | null = null;

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
    const infoHeight = Math.max(80, h * 0.15);
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
    this.isGameOver = state.gameOver;
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

    // Edit mode overlay
    if (this.editMode) {
      this.drawEditModeOverlay(ctx, L);
    }

    // Export log button (alpha test mode)
    if (this.showExportButton) {
      this.drawExportButton(ctx);
    }

    // Version label at bottom
    this.drawVersionLabel(ctx, L);
  }

  /** Expose the current layout for input hit-testing. */
  getLayout(): Layout | null {
    return this.layout;
  }

  /** Returns the restart button bounds (in CSS pixels) for hit-testing. */
  getRestartButtonBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.layout || !this.isGameOver) return null;
    const L = this.layout;
    const btnW = Math.min(200, L.width * 0.45);
    const btnH = Math.max(40, L.height * 0.06);
    const btnX = (L.width - btnW) / 2;
    const btnY = L.height / 2 + L.height * 0.06;
    return { x: btnX, y: btnY, width: btnW, height: btnH };
  }

  /** Returns the export log button bounds (in CSS pixels) for hit-testing. */
  getExportButtonBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.layout || !this.showExportButton) return null;
    const L = this.layout;
    const btnW = Math.min(100, L.width * 0.25);
    const btnH = Math.max(28, L.height * 0.035);
    const btnX = L.width - L.padding - btnW;
    const btnY = L.height - btnH - L.padding * 0.5;
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
    ctx.textAlign = 'left';

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
      this.drawGlass(ctx, gx, targetY + glassR, glassR, gt);
      gx += glassR * 2.5;
    }

    // Progress bar for target refresh
    const barX = x;
    const barY = targetY + fontSize * 1.6;
    const barW = L.width - L.padding * 2;
    const barH = Math.max(12, fontSize * 0.8);
    const progress = state.totalFullEliminations;
    const threshold = state.targetRefreshThreshold;
    const ratio = Math.min(progress / threshold, 1);

    // Bar background
    ctx.fillStyle = '#1a1a3e';
    this.roundRect(ctx, barX, barY, barW, barH, barH * 0.4);
    ctx.fill();
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 1;
    this.roundRect(ctx, barX, barY, barW, barH, barH * 0.4);
    ctx.stroke();

    // Bar fill with gradient
    if (ratio > 0) {
      const fillW = Math.max(barH * 0.8, barW * ratio);
      const grad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
      grad.addColorStop(0, '#e94560');
      grad.addColorStop(0.5, '#ff6b81');
      grad.addColorStop(1, '#ffd700');
      ctx.fillStyle = grad;
      this.roundRect(ctx, barX, barY, fillW, barH, barH * 0.4);
      ctx.fill();
    }

    // Bar text
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(9, barH * 0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${progress} / ${threshold}`, barX + barW / 2, barY + barH / 2);
    ctx.textAlign = 'left';

    // Dump mode indicator (top-right corner)
    if (this.dumpEnabled) {
      const dotR = fontSize * 0.35;
      const labelFont = `bold ${fontSize * 0.75}px sans-serif`;
      ctx.font = labelFont;
      const label = 'DUMP';
      const labelW = ctx.measureText(label).width;
      const rx = L.width - L.padding - labelW - dotR * 3;
      const ry = y + fontSize * 0.7;

      // Pulsing red dot
      ctx.beginPath();
      ctx.arc(rx, ry, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#FF3B30';
      ctx.fill();

      // Label
      ctx.fillStyle = '#FF3B30';
      ctx.fillText(label, rx + dotR * 1.5, ry - fontSize * 0.3);
    }
  }

  private drawBoard(ctx: CanvasRenderingContext2D, L: Layout, state: GameState): void {
    const { boardX, boardY, cellSize } = L;
    const { rows, cols, cells } = state.board;

    // Build obstacle lookup
    const obsMap = new Map<string, { initialSeals: number; remainingSeals: number }>();
    for (const o of state.obstacles) {
      obsMap.set(`${o.pos.row},${o.pos.col}`, o.obstacle);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = boardX + c * cellSize;
        const cy = boardY + r * cellSize;
        const cell = cells[r]?.[c] ?? null;
        const obs = obsMap.get(`${r},${c}`);

        // Cell background
        ctx.fillStyle = cell ? CELL_OCCUPIED_COLOR : CELL_EMPTY_COLOR;
        ctx.fillRect(cx, cy, cellSize, cellSize);

        // Cell border
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cellSize, cellSize);

        if (obs) {
          this.drawObstacle(ctx, cx, cy, cellSize, obs.initialSeals, obs.remainingSeals);
        } else if (cell) {
          this.drawPlate(ctx, cx, cy, cellSize, cell);
        }

        // Edit mode selection highlight
        if (this.editMode && this.editSelection?.type === 'board'
            && this.editSelection.row === r && this.editSelection.col === c) {
          ctx.save();
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          ctx.setLineDash([]);
          ctx.restore();
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
        this.drawGlass(ctx, gx, gy, glassR, gt);
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

  /**
   * 绘制障碍石
   * 1层=石质(灰), 2层=铁质(银蓝), 3层=钻石质(青白)
   * 破损程度用裂纹数量表示
   */
  private drawObstacle(
    ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
    initialSeals: number, remainingSeals: number,
  ): void {
    const inset = size * 0.06;
    const ox = x + inset;
    const oy = y + inset;
    const os = size - inset * 2;
    const r = os * 0.15;

    // Material colors based on initial seals
    let baseColor: string, strokeColor: string, label: string;
    if (initialSeals >= 3) {
      baseColor = '#88e8f0'; strokeColor = '#5cc8d0'; label = '◆';
    } else if (initialSeals >= 2) {
      baseColor = '#8899aa'; strokeColor = '#667788'; label = '■';
    } else {
      baseColor = '#998877'; strokeColor = '#776655'; label = '●';
    }

    // Draw stone body
    this.roundRect(ctx, ox, oy, os, os, r);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw cracks for broken seals
    const broken = initialSeals - remainingSeals;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    const cx = ox + os / 2;
    const cy = oy + os / 2;
    if (broken >= 1) {
      ctx.beginPath();
      ctx.moveTo(cx - os * 0.3, cy - os * 0.1);
      ctx.lineTo(cx, cy + os * 0.05);
      ctx.lineTo(cx - os * 0.1, cy + os * 0.3);
      ctx.stroke();
    }
    if (broken >= 2) {
      ctx.beginPath();
      ctx.moveTo(cx + os * 0.1, cy - os * 0.3);
      ctx.lineTo(cx + os * 0.05, cy);
      ctx.lineTo(cx + os * 0.3, cy + os * 0.15);
      ctx.stroke();
    }

    // Seal count text
    const fontSize = Math.max(10, os * 0.3);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label}${remainingSeals}`, cx, cy);
    ctx.textAlign = 'left';
  }

  private drawGlass(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, type: GlassType): void {
    const color = getGlassColor(type);
    const shape = GLASS_SHAPES[type % GLASS_SHAPES.length] ?? 'circle';

    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        break;
      case 'square':
        ctx.rect(x - radius * 0.85, y - radius * 0.85, radius * 1.7, radius * 1.7);
        break;
      case 'triangle':
        this.drawTriangle(ctx, x, y, radius);
        break;
      case 'diamond':
        this.drawDiamond(ctx, x, y, radius);
        break;
      case 'hexagon':
        this.drawHexagon(ctx, x, y, radius);
        break;
      case 'star':
        this.drawStar(ctx, x, y, radius);
        break;
      case 'heart':
        this.drawHeart(ctx, x, y, radius);
        break;
      case 'pentagon':
        this.drawPentagon(ctx, x, y, radius);
        break;
    }
    ctx.fill();
    ctx.stroke();
  }

  private drawTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const h = r * 1.2;
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h * 0.866, y + h * 0.5);
    ctx.lineTo(x - h * 0.866, y + h * 0.5);
    ctx.closePath();
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const d = r * 1.2;
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.closePath();
  }

  private drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const spikes = 5;
    const outerR = r * 1.1;
    const innerR = r * 0.5;
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? outerR : innerR;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const w = r * 0.9;
    const h = r * 1.1;
    // 心形底部尖点
    ctx.moveTo(x, y + h * 0.8);
    // 左下曲线
    ctx.bezierCurveTo(x - w * 0.6, y + h * 0.4, x - w * 1.1, y + h * 0.1, x - w * 0.9, y - h * 0.2);
    // 左上圆弧
    ctx.bezierCurveTo(x - w * 0.7, y - h * 0.5, x - w * 0.3, y - h * 0.5, x, y - h * 0.1);
    // 右上圆弧
    ctx.bezierCurveTo(x + w * 0.3, y - h * 0.5, x + w * 0.7, y - h * 0.5, x + w * 0.9, y - h * 0.2);
    // 右下曲线
    ctx.bezierCurveTo(x + w * 1.1, y + h * 0.1, x + w * 0.6, y + h * 0.4, x, y + h * 0.8);
    ctx.closePath();
  }

  private drawPentagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
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

      // Edit mode selection highlight for staging
      if (this.editMode && this.editSelection?.type === 'staging'
          && this.editSelection.index === i) {
        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(sx - 2, sy - 2, stagingCellSize + 4, stagingCellSize + 4);
        ctx.setLineDash([]);
        ctx.restore();
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

  private drawEditModeOverlay(ctx: CanvasRenderingContext2D, L: Layout): void {
    // Top banner
    const bannerH = Math.max(28, L.height * 0.04);
    ctx.fillStyle = 'rgba(233, 69, 96, 0.85)';
    ctx.fillRect(0, 0, L.width, bannerH);

    const fontSize = Math.max(12, bannerH * 0.55);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('编辑模式 — 点击选中，0-7添加酒杯，Backspace删除，Enter开始', L.width / 2, bannerH / 2);
    ctx.restore();

    // Dashed border around board
    const { boardX, boardY, boardWidth, boardHeight } = L;
    ctx.save();
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(boardX - 2, boardY - 2, boardWidth + 4, boardHeight + 4);
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawExportButton(ctx: CanvasRenderingContext2D): void {
    const btn = this.getExportButtonBounds();
    if (!btn) return;

    ctx.save();
    const r = btn.height * 0.25;
    this.roundRect(ctx, btn.x, btn.y, btn.width, btn.height, r);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const fontSize = Math.max(11, btn.height * 0.45);
    ctx.fillStyle = '#eee';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('导出日志', btn.x + btn.width / 2, btn.y + btn.height / 2);
    ctx.restore();
  }
  private drawVersionLabel(ctx: CanvasRenderingContext2D, L: Layout): void {
    const label = __DEV_MODE__
      ? `v${__VERSION__}-dev (${__BUILD_DATE__})`
      : `v${__VERSION__}`;
    ctx.save();
    ctx.font = `${Math.max(10, L.width * 0.022)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, L.width / 2, L.height - 4);
    ctx.restore();
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
