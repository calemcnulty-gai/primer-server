import path from 'path';
import fs from 'fs';
import { StoryIllustration, IllustrationMap, IllustrationRequest } from '../models/StoryIllustration';
import { StoryState, StorySegment } from '../models/StoryState';
import { StoryContext } from '../models/StoryContext';

/**
 * Service to manage and match story illustrations
 */
export class IllustrationService {
  private illustrations: IllustrationMap = {};
  private illustrationsBySegment: Record<string, string[]> = {};
  private illustrationsByTag: Record<string, string[]> = {};
  private illustrationsByTheme: Record<string, string[]> = {};
  private publicPath: string;
  private metadataPath: string;

  constructor(publicPath: string = path.join(__dirname, '../../public')) {
    this.publicPath = publicPath;
    this.metadataPath = path.join(this.publicPath, 'illustrations', 'metadata.json');
    this.loadIllustrations();
  }

  /**
   * Get illustrations that match the given segment and context
   */
  getIllustrationsForSegment(
    segmentId: string,
    context?: StoryContext,
    limit: number = 3
  ): StoryIllustration[] {
    // Get direct segment mappings first
    const segmentMatches = this.illustrationsBySegment[segmentId] || [];
    
    // If we have enough direct matches, return those
    if (segmentMatches.length >= limit) {
      return segmentMatches
        .slice(0, limit)
        .map(id => this.illustrations[id])
        .filter(Boolean);
    }
    
    // Otherwise, try to find matches based on context
    let contextMatches: string[] = [];
    
    if (context) {
      // Match by theme if available
      if (context.genre) {
        const genreMatches = this.illustrationsByTheme[context.genre.toLowerCase()] || [];
        contextMatches = [...contextMatches, ...genreMatches];
      }
      
      // Match by location if available
      if (context.location) {
        const locationMatches = this.illustrationsByTag[context.location.toLowerCase()] || [];
        contextMatches = [...contextMatches, ...locationMatches];
      }
      
      // Match by character if available
      if (context.character_name) {
        const characterMatches = this.illustrationsByTag[context.character_name.toLowerCase()] || [];
        contextMatches = [...contextMatches, ...characterMatches];
      }
    }
    
    // Combine and deduplicate matches
    const allMatchIds = [...new Set([...segmentMatches, ...contextMatches])];
    
    // Get illustrations and limit
    return allMatchIds
      .slice(0, limit)
      .map(id => this.illustrations[id])
      .filter(Boolean);
  }

  /**
   * Get illustrations based on custom filter criteria
   */
  getIllustrations(request: IllustrationRequest): StoryIllustration[] {
    const { segmentId, themes, tags, characters, limit = 5 } = request;
    let matchIds: string[] = [];
    
    // Get segment matches
    if (segmentId) {
      const segmentMatches = this.illustrationsBySegment[segmentId] || [];
      matchIds = [...matchIds, ...segmentMatches];
    }
    
    // Get theme matches
    if (themes && themes.length > 0) {
      const themeMatches = themes.flatMap(theme => 
        this.illustrationsByTheme[theme.toLowerCase()] || []
      );
      matchIds = [...matchIds, ...themeMatches];
    }
    
    // Get tag matches
    if (tags && tags.length > 0) {
      const tagMatches = tags.flatMap(tag => 
        this.illustrationsByTag[tag.toLowerCase()] || []
      );
      matchIds = [...matchIds, ...tagMatches];
    }
    
    // Get character matches
    if (characters && characters.length > 0) {
      const characterMatches = characters.flatMap(character => 
        this.illustrations[character] ? 
          this.illustrations[character].characters?.flatMap(c => 
            this.illustrationsByTag[c.toLowerCase()] || []
          ) || [] 
          : []
      );
      matchIds = [...matchIds, ...characterMatches];
    }
    
    // Deduplicate and get illustrations
    const uniqueIds = [...new Set(matchIds)];
    return uniqueIds
      .slice(0, limit)
      .map(id => this.illustrations[id])
      .filter(Boolean);
  }

  /**
   * Load illustrations from the metadata file
   */
  private loadIllustrations(): void {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const metadataJson = fs.readFileSync(this.metadataPath, 'utf8');
        const metadata = JSON.parse(metadataJson) as StoryIllustration[];
        
        for (const illustration of metadata) {
          // Add to main map
          this.illustrations[illustration.id] = {
            ...illustration,
            createdAt: new Date(illustration.createdAt)
          };
          
          // Build segment index
          for (const segmentId of illustration.segmentMappings) {
            if (!this.illustrationsBySegment[segmentId]) {
              this.illustrationsBySegment[segmentId] = [];
            }
            this.illustrationsBySegment[segmentId].push(illustration.id);
          }
          
          // Build tag index
          for (const tag of illustration.tags) {
            const normalizedTag = tag.toLowerCase();
            if (!this.illustrationsByTag[normalizedTag]) {
              this.illustrationsByTag[normalizedTag] = [];
            }
            this.illustrationsByTag[normalizedTag].push(illustration.id);
          }
          
          // Build theme index
          for (const theme of illustration.themes) {
            const normalizedTheme = theme.toLowerCase();
            if (!this.illustrationsByTheme[normalizedTheme]) {
              this.illustrationsByTheme[normalizedTheme] = [];
            }
            this.illustrationsByTheme[normalizedTheme].push(illustration.id);
          }
        }
        
        console.log(`Loaded ${Object.keys(this.illustrations).length} illustrations`);
      } else {
        console.log('No illustration metadata file found');
        this.createDefaultMetadata();
      }
    } catch (error) {
      console.error('Error loading illustrations:', error);
    }
  }

  /**
   * Create default metadata file with sample illustrations
   */
  private createDefaultMetadata(): void {
    try {
      // Create sample illustrations
      const sampleIllustrations: StoryIllustration[] = [
        {
          id: 'forest-path',
          path: '/illustrations/forest-path.jpg',
          description: 'A winding path through a lush, magical forest',
          tags: ['forest', 'path', 'nature', 'adventure', 'journey'],
          segmentMappings: ['intro', 'forest-segment'],
          themes: ['fantasy', 'adventure'],
          locations: ['forest', 'woods'],
          createdAt: new Date()
        },
        {
          id: 'mysterious-cave',
          path: '/illustrations/mysterious-cave.jpg',
          description: 'A dark cave entrance with glowing crystals inside',
          tags: ['cave', 'crystals', 'mystery', 'darkness'],
          segmentMappings: ['cave-entrance', 'underground-discovery'],
          themes: ['mystery', 'fantasy', 'adventure'],
          locations: ['cave', 'underground'],
          createdAt: new Date()
        },
        {
          id: 'ancient-temple',
          path: '/illustrations/ancient-temple.jpg',
          description: 'An ancient stone temple covered in vines and moss',
          tags: ['temple', 'ruins', 'ancient', 'stone', 'vegetation'],
          segmentMappings: ['temple-discovery', 'hidden-ruins'],
          themes: ['fantasy', 'history', 'adventure'],
          locations: ['temple', 'ruins', 'jungle'],
          createdAt: new Date()
        },
        {
          id: 'hero-character',
          path: '/illustrations/hero.jpg',
          description: 'The protagonist of the story, ready for adventure',
          tags: ['hero', 'character', 'protagonist', 'adventurer'],
          segmentMappings: ['intro', 'character-development'],
          themes: ['adventure', 'fantasy'],
          characters: ['hero', 'protagonist', 'adventurer'],
          createdAt: new Date()
        },
        {
          id: 'dragon-encounter',
          path: '/illustrations/dragon.jpg',
          description: 'A massive dragon perched on a mountain peak',
          tags: ['dragon', 'mountain', 'danger', 'creature'],
          segmentMappings: ['dragon-battle', 'mountain-peak'],
          themes: ['fantasy', 'danger', 'adventure'],
          characters: ['dragon'],
          locations: ['mountain'],
          createdAt: new Date()
        }
      ];
      
      // Create directory if it doesn't exist
      const illustrationsDir = path.dirname(this.metadataPath);
      if (!fs.existsSync(illustrationsDir)) {
        fs.mkdirSync(illustrationsDir, { recursive: true });
      }
      
      // Write metadata file
      fs.writeFileSync(
        this.metadataPath, 
        JSON.stringify(sampleIllustrations, null, 2)
      );
      
      console.log('Created default illustration metadata file');
      
      // Load the newly created metadata
      this.loadIllustrations();
    } catch (error) {
      console.error('Error creating default metadata:', error);
    }
  }

  /**
   * Get illustration by ID
   */
  getIllustrationById(id: string): StoryIllustration | null {
    return this.illustrations[id] || null;
  }

  /**
   * Add a new illustration to the collection
   */
  addIllustration(illustration: StoryIllustration): void {
    // Add to main map
    this.illustrations[illustration.id] = illustration;
    
    // Update segment index
    for (const segmentId of illustration.segmentMappings) {
      if (!this.illustrationsBySegment[segmentId]) {
        this.illustrationsBySegment[segmentId] = [];
      }
      this.illustrationsBySegment[segmentId].push(illustration.id);
    }
    
    // Update tag index
    for (const tag of illustration.tags) {
      const normalizedTag = tag.toLowerCase();
      if (!this.illustrationsByTag[normalizedTag]) {
        this.illustrationsByTag[normalizedTag] = [];
      }
      this.illustrationsByTag[normalizedTag].push(illustration.id);
    }
    
    // Update theme index
    for (const theme of illustration.themes) {
      const normalizedTheme = theme.toLowerCase();
      if (!this.illustrationsByTheme[normalizedTheme]) {
        this.illustrationsByTheme[normalizedTheme] = [];
      }
      this.illustrationsByTheme[normalizedTheme].push(illustration.id);
    }
    
    // Save metadata file
    this.saveMetadata();
  }

  /**
   * Save metadata to file
   */
  private saveMetadata(): void {
    try {
      const illustrationsArray = Object.values(this.illustrations);
      fs.writeFileSync(
        this.metadataPath, 
        JSON.stringify(illustrationsArray, null, 2)
      );
    } catch (error) {
      console.error('Error saving illustrations metadata:', error);
    }
  }
}