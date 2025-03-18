import { StoryContext } from '../models/StoryContext';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

interface CacheMap<T> {
  [key: string]: CacheEntry<T>;
}

export class StoryCache {
  private readonly ttl: number;
  private readonly maxEntries: number;
  private storySegments: CacheMap<string>;
  private choices: CacheMap<string[]>;

  constructor(ttl: number = 5 * 60 * 1000, maxEntries: number = 1000) { // Default 5 minute TTL, 1000 entries
    this.ttl = ttl;
    this.maxEntries = maxEntries;
    this.storySegments = {};
    this.choices = {};
  }

  private generateKey(context: StoryContext): string {
    // Create a deterministic key from the context object
    const sortedEntries = Object.entries(context)
      .filter(([_, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    
    return JSON.stringify(sortedEntries);
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.ttl;
  }

  private enforceMaxEntries(cache: CacheMap<any>): void {
    const entries = Object.entries(cache);
    if (entries.length > this.maxEntries) {
      // Remove oldest entries until we're under the limit
      const sortedByTimestamp = entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      const entriesToRemove = sortedByTimestamp.slice(0, entries.length - this.maxEntries);
      entriesToRemove.forEach(([key]) => delete cache[key]);
    }
  }

  private get<T>(cache: CacheMap<T>, context: StoryContext): T | null {
    const key = this.generateKey(context);
    const entry = cache[key];

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry.timestamp)) {
      delete cache[key];
      return null;
    }

    return entry.value;
  }

  private set<T>(cache: CacheMap<T>, context: StoryContext, value: T): void {
    const key = this.generateKey(context);
    cache[key] = {
      value,
      timestamp: Date.now()
    };
    this.enforceMaxEntries(cache);
  }

  getStorySegment(context: StoryContext): string | null {
    return this.get(this.storySegments, context);
  }

  setStorySegment(context: StoryContext, segment: string): void {
    this.set(this.storySegments, context, segment);
  }

  getChoices(context: StoryContext): string[] | null {
    return this.get(this.choices, context);
  }

  setChoices(context: StoryContext, choices: string[]): void {
    this.set(this.choices, context, choices);
  }

  clear(): void {
    this.storySegments = {};
    this.choices = {};
  }
} 