export interface StoryChoice {
  id: string;
  text: string;
  nextSegmentId: string;
}

export interface StorySegment {
  id: string;
  content: string;
  choices: StoryChoice[];
}

export interface UserChoice {
  segmentId: string;
  choiceId: string;
  timestamp: Date;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export type ContextualData = Record<string, any>;

interface StoryStateData {
  userId: string;
  currentSegmentId: string;
  segments: Record<string, StorySegment>;
  choiceHistory: UserChoice[];
  contextualData: ContextualData;
  readSegments: string[];
  conversationHistory?: ConversationMessage[];
  isConversationalMode?: boolean;
}

export class StoryState {
  userId: string;
  currentSegmentId: string;
  segments: Record<string, StorySegment>;
  choiceHistory: UserChoice[];
  contextualData: ContextualData;
  conversationHistory: ConversationMessage[] = [];
  isConversationalMode: boolean = false;
  private readSegments: Set<string> = new Set();

  constructor(
    userId: string,
    currentSegmentId: string = 'intro',
    segments: Record<string, StorySegment> = {},
    choiceHistory: UserChoice[] = [],
    contextualData: ContextualData = {},
    conversationHistory: ConversationMessage[] = [],
    isConversationalMode: boolean = false
  ) {
    this.userId = userId;
    this.currentSegmentId = currentSegmentId;
    this.segments = segments;
    this.choiceHistory = choiceHistory;
    this.contextualData = contextualData;
    this.conversationHistory = conversationHistory;
    this.isConversationalMode = isConversationalMode;
  }

  addSegment(segment: StorySegment): void {
    this.segments[segment.id] = segment;
  }

  getCurrentSegment(): StorySegment | null {
    return this.segments[this.currentSegmentId] || null;
  }

  makeChoice(choiceId: string): void {
    const currentSegment = this.getCurrentSegment();
    if (!currentSegment) {
      throw new Error('No current segment found');
    }

    const choice = currentSegment.choices.find(c => c.id === choiceId);
    if (!choice) {
      throw new Error('Invalid choice ID');
    }

    // Mark current segment as read
    this.markSegmentAsRead(this.currentSegmentId);

    // Record the choice in history
    this.choiceHistory.push({
      segmentId: this.currentSegmentId,
      choiceId,
      timestamp: new Date()
    });

    // Update current segment
    this.currentSegmentId = choice.nextSegmentId;
  }

  /**
   * Add a message to the conversation history
   */
  addConversationMessage(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date()
    });
  }

  /**
   * Switch to conversational mode
   */
  enableConversationalMode(): void {
    this.isConversationalMode = true;
  }

  updateContextualData(newData: ContextualData): void {
    this.contextualData = this.deepMerge(this.contextualData, newData);
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  toJSON(): StoryStateData {
    return {
      userId: this.userId,
      currentSegmentId: this.currentSegmentId,
      segments: this.segments,
      choiceHistory: this.choiceHistory,
      contextualData: this.contextualData,
      readSegments: Array.from(this.readSegments),
      conversationHistory: this.conversationHistory,
      isConversationalMode: this.isConversationalMode
    };
  }

  static fromJSON(data: any): StoryState {
    // Process choice history to convert string timestamps to Date objects
    const choiceHistory = Array.isArray(data.choiceHistory) 
      ? data.choiceHistory.map((choice: any) => ({
          segmentId: choice.segmentId,
          choiceId: choice.choiceId,
          timestamp: typeof choice.timestamp === 'string' 
            ? new Date(choice.timestamp) 
            : choice.timestamp
        }))
      : [];
      
    // Process conversation history if available
    const conversationHistory = Array.isArray(data.conversationHistory)
      ? data.conversationHistory.map((message: any) => ({
          role: message.role,
          content: message.content,
          timestamp: typeof message.timestamp === 'string'
            ? new Date(message.timestamp)
            : message.timestamp
        }))
      : [];

    const storyState = new StoryState(
      data.userId,
      data.currentSegmentId,
      data.segments,
      choiceHistory,
      data.contextualData,
      conversationHistory,
      data.isConversationalMode || false
    );

    // Restore read segments
    if (Array.isArray(data.readSegments)) {
      data.readSegments.forEach((segmentId: string) => {
        storyState.readSegments.add(segmentId);
      });
    }

    return storyState;
  }

  getPublicState(): Record<string, any> {
    return {
      userId: this.userId,
      currentSegmentId: this.currentSegmentId,
      progress: this.calculateProgress(),
      contextualData: this.contextualData,
      readSegments: Array.from(this.readSegments),
      isConversationalMode: this.isConversationalMode,
      // Only include last few messages for the public state
      recentConversation: this.conversationHistory.slice(-5)
    };
  }

  private calculateProgress(): number {
    const totalSegments = Object.keys(this.segments).length;
    const readCount = this.readSegments.size;
    return totalSegments > 0 ? Math.round((readCount / totalSegments) * 100) : 0;
  }

  markSegmentAsRead(segmentId: string): void {
    if (this.segments[segmentId]) {
      this.readSegments.add(segmentId);
    }
  }

  isSegmentRead(segmentId: string): boolean {
    return this.readSegments.has(segmentId);
  }

  getReadSegments(): string[] {
    return Array.from(this.readSegments);
  }
} 