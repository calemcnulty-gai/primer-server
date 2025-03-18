/**
 * Monitoring utilities for the story engine
 */
import path from 'path';
import fs from 'fs';
import { StorySegment, StoryChoice } from '../models/StoryState';

interface GPTMetrics {
  requestId: string;
  userId: string;
  endpoint: string;
  timestamp: Date;
  latency: number; // ms
  promptTokens: number;
  completionTokens: number;
  success: boolean;
  error?: string;
  model?: string;
}

interface StoryGenerationMetrics {
  requestId: string;
  userId: string;
  segmentId: string;
  previousSegmentId?: string;
  choiceId?: string;
  timestamp: Date;
  latency: number; // ms
  success: boolean;
  error?: string;
  gptMetrics?: GPTMetrics;
}

interface MonitoringOptions {
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  logDirectory: string;
  sampleRate: number; // 0-1, percentage of requests to log
}

class StoryMonitoring {
  private options: MonitoringOptions;
  private segmentGenerationLog: StoryGenerationMetrics[] = [];
  private gptRequestLog: GPTMetrics[] = [];
  
  constructor(options?: Partial<MonitoringOptions>) {
    this.options = {
      enableConsoleLogging: true,
      enableFileLogging: true,
      logDirectory: path.join(__dirname, '../../logs'),
      sampleRate: 0.1, // Log 10% of requests by default
      ...options
    };
    
    // Create log directory if it doesn't exist
    if (this.options.enableFileLogging && !fs.existsSync(this.options.logDirectory)) {
      fs.mkdirSync(this.options.logDirectory, { recursive: true });
    }
  }
  
  /**
   * Log a GPT API request
   */
  logGPTRequest(metrics: Omit<GPTMetrics, 'timestamp'>): string {
    const timestamp = new Date();
    const requestId = metrics.requestId || this.generateRequestId();
    
    const fullMetrics: GPTMetrics = {
      ...metrics,
      requestId,
      timestamp
    };
    
    // Store in memory
    this.gptRequestLog.push(fullMetrics);
    
    // Keep log size manageable
    if (this.gptRequestLog.length > 1000) {
      this.gptRequestLog.shift();
    }
    
    // Log to console if enabled
    if (this.options.enableConsoleLogging) {
      console.log(`[GPT Request] ${requestId} | User: ${metrics.userId} | Endpoint: ${metrics.endpoint} | Model: ${metrics.model || 'unknown'} | Latency: ${metrics.latency}ms | Success: ${metrics.success}`);
      
      if (metrics.error) {
        console.error(`[GPT Error] ${requestId} | ${metrics.error}`);
      }
    }
    
    // Log to file if enabled and passes sample rate
    if (this.options.enableFileLogging && Math.random() <= this.options.sampleRate) {
      this.appendToLogFile('gpt-requests.log', JSON.stringify(fullMetrics));
    }
    
    return requestId;
  }
  
  /**
   * Log a story segment generation
   */
  logStoryGeneration(metrics: Omit<StoryGenerationMetrics, 'timestamp'>): string {
    const timestamp = new Date();
    const requestId = metrics.requestId || this.generateRequestId();
    
    const fullMetrics: StoryGenerationMetrics = {
      ...metrics,
      requestId,
      timestamp
    };
    
    // Store in memory
    this.segmentGenerationLog.push(fullMetrics);
    
    // Keep log size manageable
    if (this.segmentGenerationLog.length > 1000) {
      this.segmentGenerationLog.shift();
    }
    
    // Log to console if enabled
    if (this.options.enableConsoleLogging) {
      console.log(`[Story Generation] ${requestId} | User: ${metrics.userId} | Segment: ${metrics.segmentId} | Latency: ${metrics.latency}ms | Success: ${metrics.success}`);
      
      if (metrics.error) {
        console.error(`[Story Error] ${requestId} | ${metrics.error}`);
      }
    }
    
    // Log to file if enabled and passes sample rate
    if (this.options.enableFileLogging && Math.random() <= this.options.sampleRate) {
      this.appendToLogFile('story-generations.log', JSON.stringify(fullMetrics));
    }
    
    return requestId;
  }
  
  /**
   * Get recent GPT metrics
   */
  getRecentGPTMetrics(limit: number = 100): GPTMetrics[] {
    return this.gptRequestLog.slice(-limit);
  }
  
  /**
   * Get recent story generation metrics
   */
  getRecentStoryGenerationMetrics(limit: number = 100): StoryGenerationMetrics[] {
    return this.segmentGenerationLog.slice(-limit);
  }
  
  /**
   * Get GPT metrics by user ID
   */
  getGPTMetricsByUser(userId: string, limit: number = 100): GPTMetrics[] {
    return this.gptRequestLog
      .filter(metric => metric.userId === userId)
      .slice(-limit);
  }
  
  /**
   * Get story generation metrics by user ID
   */
  getStoryGenerationMetricsByUser(userId: string, limit: number = 100): StoryGenerationMetrics[] {
    return this.segmentGenerationLog
      .filter(metric => metric.userId === userId)
      .slice(-limit);
  }
  
  /**
   * Generate a random request ID
   */
  private generateRequestId(): string {
    return `req_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  /**
   * Append data to a log file
   */
  private appendToLogFile(filename: string, data: string): void {
    try {
      const logPath = path.join(this.options.logDirectory, filename);
      fs.appendFileSync(logPath, data + '\n');
    } catch (error) {
      console.error(`Error writing to log file: ${error}`);
    }
  }
  
  /**
   * Get average latency for GPT requests
   */
  getAverageGPTLatency(timeFrame: number = 3600000): number {
    const now = Date.now();
    const metrics = this.gptRequestLog.filter(
      metric => now - metric.timestamp.getTime() < timeFrame
    );
    
    if (metrics.length === 0) {
      return 0;
    }
    
    const totalLatency = metrics.reduce((sum, metric) => sum + metric.latency, 0);
    return totalLatency / metrics.length;
  }
  
  /**
   * Get error rate for GPT requests
   */
  getGPTErrorRate(timeFrame: number = 3600000): number {
    const now = Date.now();
    const metrics = this.gptRequestLog.filter(
      metric => now - metric.timestamp.getTime() < timeFrame
    );
    
    if (metrics.length === 0) {
      return 0;
    }
    
    const errorCount = metrics.filter(metric => !metric.success).length;
    return errorCount / metrics.length;
  }
  
  /**
   * Get token usage statistics
   */
  getTokenUsageStats(timeFrame: number = 3600000): { promptTokens: number, completionTokens: number, totalTokens: number } {
    const now = Date.now();
    const metrics = this.gptRequestLog.filter(
      metric => now - metric.timestamp.getTime() < timeFrame
    );
    
    const promptTokens = metrics.reduce((sum, metric) => sum + metric.promptTokens, 0);
    const completionTokens = metrics.reduce((sum, metric) => sum + metric.completionTokens, 0);
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }
  
  /**
   * Get performance metrics dashboard data
   */
  getDashboardData(): any {
    const lastHour = 3600000;
    const lastDay = 86400000;
    
    return {
      gptRequests: {
        count: this.gptRequestLog.length,
        lastHour: this.gptRequestLog.filter(
          metric => Date.now() - metric.timestamp.getTime() < lastHour
        ).length,
        lastDay: this.gptRequestLog.filter(
          metric => Date.now() - metric.timestamp.getTime() < lastDay
        ).length,
        averageLatency: this.getAverageGPTLatency(),
        errorRate: this.getGPTErrorRate()
      },
      storyGenerations: {
        count: this.segmentGenerationLog.length,
        lastHour: this.segmentGenerationLog.filter(
          metric => Date.now() - metric.timestamp.getTime() < lastHour
        ).length,
        lastDay: this.segmentGenerationLog.filter(
          metric => Date.now() - metric.timestamp.getTime() < lastDay
        ).length
      },
      tokenUsage: this.getTokenUsageStats(lastDay)
    };
  }
}

// Export a singleton instance
export const storyMonitoring = new StoryMonitoring();

// Export types
export { GPTMetrics, StoryGenerationMetrics, MonitoringOptions };