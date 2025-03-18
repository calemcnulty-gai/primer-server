export interface StoryContext {
  // Required fields
  userId: string;
  
  // Story style and genre
  genre?: string;
  tone?: string;
  audience?: string;
  
  // Character details
  character?: string;
  character_name?: string;
  age?: number;
  
  // Setting details
  setting?: string;
  location?: string;
  
  // Story history
  previousSegment?: string;
  lastChoice?: string;
  choiceHistory?: string[];
  
  // Additional metadata
  [key: string]: any; // Allow for future extensibility
} 