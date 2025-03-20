/**
 * Simple logger utility with service namespacing
 */
export class Logger {
  private serviceName: string;
  
  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }
  
  /**
   * Format a log message with timestamp and service name
   */
  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.serviceName}] ${message}`;
  }
  
  /**
   * Log a debug message
   */
  public debug(message: string, ...args: any[]): void {
    console.debug(this.formatMessage('DEBUG', message), ...args);
  }
  
  /**
   * Log an informational message
   */
  public info(message: string, ...args: any[]): void {
    console.info(this.formatMessage('INFO', message), ...args);
  }
  
  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage('WARN', message), ...args);
  }
  
  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('ERROR', message), ...args);
  }
}

/**
 * Create a logger for a service
 * @param serviceName Name of the service for log context
 * @returns Logger instance
 */
export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName);
}