import type { IInputHandler } from '../types';
import type { CanvasRenderer } from './canvas-renderer';

/**
 * InputHandler converts raw mouse/touch events on the canvas into
 * semantic game actions (cell click, staging click, restart click).
 *
 * It relies on the CanvasRenderer's layout info to map pixel
 * coordinates to board rows/cols and staging indices.
 */
export class InputHandler implements IInputHandler {
  private renderer: CanvasRenderer;
  private element: HTMLElement | null = null;

  private cellClickCallback: ((row: number, col: number) => void) | null = null;
  private stagingClickCallback: ((index: number) => void) | null = null;
  private restartClickCallback: (() => void) | null = null;
  private exportLogClickCallback: (() => void) | null = null;

  // Bound handlers for cleanup
  private handleClick: ((e: MouseEvent) => void) | null = null;
  private handleTouchEnd: ((e: TouchEvent) => void) | null = null;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
  }

  init(element: HTMLElement): void {
    this.element = element;

    this.handleClick = (e: MouseEvent) => {
      const coords = this.getCanvasCoords(e.clientX, e.clientY);
      if (coords) this.dispatchHit(coords.x, coords.y);
    };

    this.handleTouchEnd = (e: TouchEvent) => {
      // Prevent the subsequent mouse click from firing
      e.preventDefault();
      const touch = e.changedTouches[0];
      if (!touch) return;
      const coords = this.getCanvasCoords(touch.clientX, touch.clientY);
      if (coords) this.dispatchHit(coords.x, coords.y);
    };

    element.addEventListener('click', this.handleClick);
    element.addEventListener('touchend', this.handleTouchEnd, { passive: false });
  }

  destroy(): void {
    if (this.element) {
      if (this.handleClick) {
        this.element.removeEventListener('click', this.handleClick);
      }
      if (this.handleTouchEnd) {
        this.element.removeEventListener('touchend', this.handleTouchEnd);
      }
    }
    this.element = null;
    this.handleClick = null;
    this.handleTouchEnd = null;
    this.cellClickCallback = null;
    this.stagingClickCallback = null;
    this.restartClickCallback = null;
    this.exportLogClickCallback = null;
  }

  onCellClick(callback: (row: number, col: number) => void): void {
    this.cellClickCallback = callback;
  }

  onStagingClick(callback: (index: number) => void): void {
    this.stagingClickCallback = callback;
  }

  onRestartClick(callback: () => void): void {
    this.restartClickCallback = callback;
  }

  onExportLogClick(callback: () => void): void {
    this.exportLogClickCallback = callback;
  }

  // --- Private helpers ---

  /**
   * Convert client (viewport) coordinates to CSS coordinates
   * relative to the canvas element.
   */
  private getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.element) return null;
    const rect = this.element.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  /**
   * Given a point in CSS canvas coordinates, determine which
   * game region was hit and fire the appropriate callback.
   */
  private dispatchHit(x: number, y: number): void {
    // Check restart button first (it overlays everything during game over)
    if (this.tryRestartHit(x, y)) return;
    if (this.tryExportLogHit(x, y)) return;
    if (this.tryCellHit(x, y)) return;
    this.tryStagingHit(x, y);
  }

  private tryRestartHit(x: number, y: number): boolean {
    if (!this.restartClickCallback) return false;
    const bounds = this.renderer.getRestartButtonBounds();
    if (!bounds) return false;

    if (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    ) {
      this.restartClickCallback();
      return true;
    }
    return false;
  }

  private tryExportLogHit(x: number, y: number): boolean {
    if (!this.exportLogClickCallback) return false;
    const bounds = this.renderer.getExportButtonBounds();
    if (!bounds) return false;

    if (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    ) {
      this.exportLogClickCallback();
      return true;
    }
    return false;
  }

  private tryCellHit(x: number, y: number): boolean {
    if (!this.cellClickCallback) return false;
    const layout = this.renderer.getLayout();
    if (!layout || layout.cellSize <= 0) return false;

    const { boardX, boardY, cellSize, boardWidth, boardHeight } = layout;

    // Check if point is within the board area
    if (
      x < boardX ||
      x >= boardX + boardWidth ||
      y < boardY ||
      y >= boardY + boardHeight
    ) {
      return false;
    }

    const col = Math.floor((x - boardX) / cellSize);
    const row = Math.floor((y - boardY) / cellSize);

    this.cellClickCallback(row, col);
    return true;
  }

  private tryStagingHit(x: number, y: number): boolean {
    if (!this.stagingClickCallback) return false;
    const layout = this.renderer.getLayout();
    if (!layout || layout.stagingCellSize <= 0) return false;

    const { stagingX, stagingY, stagingCellSize, padding } = layout;

    // Staging area has 3 slots laid out horizontally
    for (let i = 0; i < 3; i++) {
      const sx = stagingX + i * (stagingCellSize + padding);
      const sy = stagingY;

      if (
        x >= sx &&
        x <= sx + stagingCellSize &&
        y >= sy &&
        y <= sy + stagingCellSize
      ) {
        this.stagingClickCallback(i);
        return true;
      }
    }
    return false;
  }
}
