/**
 * Simple logger utility with service namespacing and log levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export class Logger {
  private serviceName: string;
  private minLevel: LogLevel;
  
  constructor(serviceName: string, minLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }
  
  /**
   * Set the minimum log level for this logger
   */
  public setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
  
  /**
   * Format a log message with timestamp and service name
   */
  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.serviceName}] ${message}`;
  }
  
  /**
   * Log a debug message
   */
  public debug(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message), ...args);
    }
  }
  
  /**
   * Log an informational message
   */
  public info(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      console.info(this.formatMessage('INFO', message), ...args);
    }
  }
  
  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }
  
  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }
}

// Global log level - can be overridden per service
let globalLogLevel: LogLevel = LogLevel.INFO;

// Map of service-specific log levels
const serviceLogLevels: Map<string, LogLevel> = new Map();

/**
 * Set the global minimum log level
 * @param level Minimum log level to display
 */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

/**
 * Set the log level for a specific service
 * @param serviceName The service name
 * @param level Minimum log level to display
 */
export function setServiceLogLevel(serviceName: string, level: LogLevel): void {
  serviceLogLevels.set(serviceName, level);
}

/**
 * Create a logger for a service
 * @param serviceName Name of the service for log context
 * @returns Logger instance
 */
export function createLogger(serviceName: string): Logger {
  // Use service-specific level if set, otherwise use global level
  const logLevel = serviceLogLevels.has(serviceName) 
    ? serviceLogLevels.get(serviceName)! 
    : globalLogLevel;
    
  return new Logger(serviceName, logLevel);
}

// Initialize log levels from environment variable
if (process.env.LOG_LEVEL) {
  try {
    const level = parseInt(process.env.LOG_LEVEL, 10);
    if (level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
      setGlobalLogLevel(level);
      console.log(`Set global log level to ${LogLevel[level]}`);
    }
  } catch (e) {
    console.error('Invalid LOG_LEVEL environment variable', e);
  }
}

// Initialize service-specific log levels from environment variables
// Format: LOG_LEVEL_SERVICE_NAME=2 (e.g., LOG_LEVEL_VOICE_SERVICE=2 for WARN level)
for (const key in process.env) {
  if (key.startsWith('LOG_LEVEL_')) {
    try {
      const serviceName = key.substring(10).replace(/_/g, '');
      const level = parseInt(process.env[key]!, 10);
      if (level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
        setServiceLogLevel(serviceName, level);
        console.log(`Set log level for ${serviceName} to ${LogLevel[level]}`);
      }
    } catch (e) {
      console.error(`Invalid log level in environment variable ${key}`, e);
    }
  }
}