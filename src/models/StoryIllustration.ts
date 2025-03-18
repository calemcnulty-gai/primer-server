/**
 * Represents a story illustration with metadata
 */
export interface StoryIllustration {
  id: string;
  path: string;
  description: string;
  tags: string[];
  segmentMappings: string[];
  themes: string[];
  characters?: string[];
  locations?: string[];
  styles?: string[];
  credit?: string;
  createdAt: Date;
}

/**
 * Map of illustrations by ID
 */
export type IllustrationMap = Record<string, StoryIllustration>;

/**
 * Parameters for requesting illustrations
 */
export interface IllustrationRequest {
  segmentId?: string;
  themes?: string[];
  tags?: string[];
  characters?: string[];
  limit?: number;
}