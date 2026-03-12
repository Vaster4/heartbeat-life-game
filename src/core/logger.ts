/**
 * 游戏日志系统
 * 记录所有游戏事件（放置、合并、消除、得分、轮次等），
 * 支持 console 输出和导出为文件下载。
 */

export type LogLevel = 'INFO' | 'DEBUG' | 'WARN';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
}

export class GameLogger {
  private entries: LogEntry[] = [];
  private consoleEnabled: boolean;

  constructor(consoleEnabled = true) {
    this.consoleEnabled = consoleEnabled;
  }

  info(category: string, message: string): void {
    this.log('INFO', category, message);
  }

  debug(category: string, message: string): void {
    this.log('DEBUG', category, message);
  }

  warn(category: string, message: string): void {
    this.log('WARN', category, message);
  }

  /** 获取所有日志条目 */
  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  /** 清空日志 */
  clear(): void {
    this.entries = [];
  }

  /** 导出日志为文本 */
  export(): string {
    return this.entries
      .map((e) => `[${e.timestamp}] [${e.level}] [${e.category}] ${e.message}`)
      .join('\n');
  }

  /** 下载日志文件到用户本地 */
  download(filename = 'game-log.txt'): void {
    const text = this.export();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private log(level: LogLevel, category: string, message: string): void {
    const now = new Date();
    const timestamp = now.toISOString();
    const entry: LogEntry = { timestamp, level, category, message };
    this.entries.push(entry);

    if (this.consoleEnabled) {
      const prefix = `[${timestamp}] [${category}]`;
      switch (level) {
        case 'WARN':
          console.warn(prefix, message);
          break;
        case 'DEBUG':
          console.debug(prefix, message);
          break;
        default:
          console.log(prefix, message);
      }
    }
  }
}
