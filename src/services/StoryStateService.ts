import { StoryState, StorySegment, StoryChoice, ConversationMessage } from '../models/StoryState';
import { StoryTemplate } from '../models/StoryTemplate';
import { GPTClient } from './GPTClient';
import { StateStorageInterface } from './persistence/StateStorageInterface';
import { InMemoryStateStorage } from './persistence/InMemoryStateStorage';
import { PersonalizationManager } from './PersonalizationManager';
import { StoryContext } from '../models/StoryContext';

export class StoryStateService {
  private storyStates: Record<string, StoryState> = {};
  private storyTemplates: Record<string, StoryTemplate> = {};
  private gptClient: GPTClient;
  private stateStorage: StateStorageInterface;
  private personalizationManager: PersonalizationManager;
  
  constructor(
    gptClient: GPTClient, 
    stateStorage: StateStorageInterface = new InMemoryStateStorage(),
    personalizationManager: PersonalizationManager = new PersonalizationManager()
  ) {
    this.gptClient = gptClient;
    this.stateStorage = stateStorage;
    this.personalizationManager = personalizationManager;
    // In a real implementation, templates would be loaded from a database or file system
    this.loadTemplates();
  }
  
  /**
   * Get the GPTClient for direct access
   */
  getGPTClient(): GPTClient {
    return this.gptClient;
  }
  
  /**
   * Store a state directly in memory (for creating new conversational stories)
   */
  storeState(userId: string, storyState: StoryState): void {
    this.storyStates[userId] = storyState;
  }
  
  async getOrCreateStoryState(userId: string): Promise<StoryState> {
    const startTime = Date.now();
    console.log(`[StoryStateService] Getting story state for userId: ${userId}`);
    
    // Check if the story state already exists in memory
    if (this.storyStates[userId]) {
      console.log(`[StoryStateService] Found in-memory story state for userId: ${userId} (${Date.now() - startTime}ms)`);
      return this.storyStates[userId];
    }
    
    // Check if state exists in storage
    const storageCheckStart = Date.now();
    const existsInStorage = await this.stateStorage.hasState(userId);
    console.log(`[StoryStateService] Storage check completed in ${Date.now() - storageCheckStart}ms`);
    
    if (existsInStorage) {
      // Load from storage
      const loadStart = Date.now();
      const stateData = await this.stateStorage.loadState(userId);
      const storyState = StoryState.fromJSON(stateData!);
      console.log(`[StoryStateService] Loaded state from storage in ${Date.now() - loadStart}ms`);
      
      // Cache in memory
      this.storyStates[userId] = storyState;
      console.log(`[StoryStateService] getOrCreateStoryState (from storage) completed in ${Date.now() - startTime}ms`);
      return storyState;
    }
    
    console.log(`[StoryStateService] No existing state found, creating new state for userId: ${userId}`);
    
    // Create a new story state
    const storyState = new StoryState(userId);
    
    // Generate the initial story segment
    const generateStart = Date.now();
    const initialSegment = await this.generateInitialStorySegment(userId);
    console.log(`[StoryStateService] Initial segment generation completed in ${Date.now() - generateStart}ms`);
    
    storyState.addSegment(initialSegment);
    
    // Store the state in memory
    this.storyStates[userId] = storyState;
    
    // Persist to storage
    const saveStart = Date.now();
    await this.saveStoryState(userId);
    console.log(`[StoryStateService] Saved new state to storage in ${Date.now() - saveStart}ms`);
    
    console.log(`[StoryStateService] getOrCreateStoryState (new state) completed in ${Date.now() - startTime}ms`);
    return storyState;
  }
  
  async generateInitialStorySegment(userId: string): Promise<StorySegment> {
    // Import here to avoid circular dependencies
    const { storyMonitoring } = require('../utils/storyMonitoring');
    
    const startTime = Date.now();
    console.log(`[StoryStateService] Generating initial story segment for userId: ${userId}`);
    const requestId = `seg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      // Get the template for the user (based on their preferences, progress, etc.)
      const templateStart = Date.now();
      const template = this.getTemplateForUser(userId);
      console.log(`[StoryStateService] Template lookup completed in ${Date.now() - templateStart}ms`);
      
      let segment: StorySegment;
      
      if (template) {
        console.log(`[StoryStateService] Using template for initial segment generation`);
        // Use the template to generate the initial segment
        const userVarsStart = Date.now();
        const userVariables = await this.getUserVariables(userId);
        console.log(`[StoryStateService] User variables fetched in ${Date.now() - userVarsStart}ms`);
        
        const templateGenStart = Date.now();
        segment = template.generateSegment('intro', userVariables);
        console.log(`[StoryStateService] Template segment generation completed in ${Date.now() - templateGenStart}ms`);
      } else {
        console.log(`[StoryStateService] No template found, using AI generation`);
        // No template available, use AI generation
        const prompt = 'Generate an engaging introductory story segment for a new adventure.';
        
        const contextStart = Date.now();
        const userContext = await this.getUserContext(userId);
        console.log(`[StoryStateService] User context fetched in ${Date.now() - contextStart}ms`);
        
        // Enrich context with personalization
        const enrichStart = Date.now();
        const enrichedContext = await this.personalizationManager.enrichContext(userContext);
        console.log(`[StoryStateService] Context enrichment completed in ${Date.now() - enrichStart}ms`);
        
        // Generate content using GPT
        console.log(`[StoryStateService] Starting GPT content generation`);
        const gptContentStart = Date.now();
        const content = await this.gptClient.generateStorySegment({
          prompt,
          context: enrichedContext
        });
        console.log(`[StoryStateService] GPT content generation completed in ${Date.now() - gptContentStart}ms`);
        
        // Generate choices using GPT
        console.log(`[StoryStateService] Starting GPT choice generation`);
        const gptChoicesStart = Date.now();
        const choices = await this.gptClient.generateStoryChoices({
          currentSegment: content,
          context: enrichedContext,
          numChoices: 2
        });
        console.log(`[StoryStateService] GPT choice generation completed in ${Date.now() - gptChoicesStart}ms`);
        
        segment = {
          id: 'intro',
          content,
          choices
        };
      }
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // Log the story generation
      storyMonitoring.logStoryGeneration({
        requestId,
        userId,
        segmentId: segment.id,
        latency,
        success: true
      });
      
      console.log(`[StoryStateService] Initial segment generation total time: ${latency}ms`);
      return segment;
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      console.error(`[StoryStateService] Error generating initial segment (${latency}ms):`, error);
      
      // Log the error
      storyMonitoring.logStoryGeneration({
        requestId,
        userId,
        segmentId: 'intro',
        latency,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }
  
  async generateNextSegment(userId: string, choiceId: string): Promise<StorySegment> {
    // Import here to avoid circular dependencies
    const { storyMonitoring } = require('../utils/storyMonitoring');
    
    const startTime = Date.now();
    console.log(`[StoryStateService] Generating next segment for userId: ${userId}, choiceId: ${choiceId}`);
    const requestId = `seg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      // Get the user's story state
      const getStateStart = Date.now();
      const storyState = await this.getOrCreateStoryState(userId);
      console.log(`[StoryStateService] Story state retrieved in ${Date.now() - getStateStart}ms`);
      
      // Get the current segment
      const currentSegment = storyState.getCurrentSegment();
      if (!currentSegment) {
        throw new Error('Current story segment not found');
      }
      
      // Find the selected choice
      const selectedChoice = currentSegment.choices.find(choice => choice.id === choiceId);
      if (!selectedChoice) {
        throw new Error(`Choice ${choiceId} not found in current segment`);
      }
      
      // Update the story state based on the choice
      storyState.makeChoice(choiceId);
      
      // Check if we already have the next segment
      const nextSegmentId = selectedChoice.nextSegmentId;
      if (storyState.segments[nextSegmentId]) {
        console.log(`[StoryStateService] Found cached next segment: ${nextSegmentId}`);
        // Save the updated state (because we made a choice)
        const saveStart = Date.now();
        await this.saveStoryState(userId);
        console.log(`[StoryStateService] Saved state in ${Date.now() - saveStart}ms`);
        
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        // Log the cached segment retrieval
        storyMonitoring.logStoryGeneration({
          requestId,
          userId,
          segmentId: nextSegmentId,
          previousSegmentId: currentSegment.id,
          choiceId,
          latency,
          success: true
        });
        
        console.log(`[StoryStateService] Retrieved cached next segment in ${latency}ms`);
        return storyState.segments[nextSegmentId];
      }
      
      console.log(`[StoryStateService] Generating new next segment`);
      // Get base context
      const contextStart = Date.now();
      const baseContext = await this.getUserContext(userId);
      baseContext.previousSegment = currentSegment.content;
      baseContext.choice = selectedChoice.text;
      console.log(`[StoryStateService] Base context created in ${Date.now() - contextStart}ms`);
      
      // Enrich with personalization
      const enrichStart = Date.now();
      const enrichedContext = await this.personalizationManager.enrichContext(baseContext);
      console.log(`[StoryStateService] Context enrichment completed in ${Date.now() - enrichStart}ms`);
      
      const prompt = `Continue the story based on the choice: "${selectedChoice.text}". 
                     Previous segment: "${currentSegment.content}"`;
      
      // Generate content using GPT
      console.log(`[StoryStateService] Starting GPT content generation`);
      const gptContentStart = Date.now();
      const content = await this.gptClient.generateStorySegment({
        prompt,
        context: enrichedContext
      });
      console.log(`[StoryStateService] GPT content generation completed in ${Date.now() - gptContentStart}ms`);
      
      // Generate choices using GPT
      console.log(`[StoryStateService] Starting GPT choice generation`);
      const gptChoicesStart = Date.now();
      const choices = await this.gptClient.generateStoryChoices({
        currentSegment: content,
        context: enrichedContext,
        numChoices: 2
      });
      console.log(`[StoryStateService] GPT choice generation completed in ${Date.now() - gptChoicesStart}ms`);
      
      // Create the new segment
      const nextSegment: StorySegment = {
        id: nextSegmentId,
        content,
        choices
      };
      
      // Add the segment to the story state
      storyState.addSegment(nextSegment);
      
      // Save the updated state
      const saveStart = Date.now();
      await this.saveStoryState(userId);
      console.log(`[StoryStateService] Saved state in ${Date.now() - saveStart}ms`);
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // Log the story generation
      storyMonitoring.logStoryGeneration({
        requestId,
        userId,
        segmentId: nextSegmentId,
        previousSegmentId: currentSegment.id,
        choiceId,
        latency,
        success: true
      });
      
      console.log(`[StoryStateService] Generated next segment in ${latency}ms`);
      return nextSegment;
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      console.error(`[StoryStateService] Error generating next segment (${latency}ms):`, error);
      
      // Log the error
      storyMonitoring.logStoryGeneration({
        requestId,
        userId,
        choiceId,
        latency,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }
  
  /**
   * Generate a conversational story response based on user input
   */
  async generateConversationResponse(
    userId: string, 
    userInput: string, 
    conversationHistory: ConversationMessage[]
  ): Promise<string> {
    // Import here to avoid circular dependencies
    const { storyMonitoring } = require('../utils/storyMonitoring');
    
    const startTime = Date.now();
    console.log(`[StoryStateService] Generating conversation response for userId: ${userId}`);
    const requestId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      // Get the user context enriched with personalization
      const contextStart = Date.now();
      const baseContext = await this.getUserContext(userId);
      
      // Add conversation history and user input
      baseContext.userInput = userInput;
      baseContext.conversationHistory = conversationHistory;
      
      const enrichedContext = await this.personalizationManager.enrichContext(baseContext);
      console.log(`[StoryStateService] Context prepared in ${Date.now() - contextStart}ms`);
      
      // Generate the story response
      const generateStart = Date.now();
      const prompt = `Continue this interactive story based on the user's input: "${userInput}".
                    Respond directly as the narrator, crafting a vivid, engaging continuation of the story that
                    incorporates the user's input naturally. Keep the response concise (2-4 paragraphs) and engaging.
                    Don't refer to the user's input directly or use phrases like "based on what you said".
                    Instead, weave their contribution seamlessly into the narrative.`;
      
      const response = await this.gptClient.generateStorySegment({
        prompt,
        context: enrichedContext
      });
      console.log(`[StoryStateService] Response generated in ${Date.now() - generateStart}ms`);
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // Log the conversation generation
      storyMonitoring.logStoryGeneration({
        requestId,
        userId,
        segmentId: 'conversation',
        latency,
        success: true,
        isConversational: true
      });
      
      return response;
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      console.error(`[StoryStateService] Error generating conversation response (${latency}ms):`, error);
      
      // Log the error
      storyMonitoring.logStoryGeneration({
        requestId,
        userId,
        latency,
        success: false,
        isConversational: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }
  
  async getCurrentStorySegment(userId: string): Promise<StorySegment> {
    // Get or create the story state
    const storyState = await this.getOrCreateStoryState(userId);
    
    // Get the current segment
    const currentSegment = storyState.getCurrentSegment();
    if (!currentSegment) {
      throw new Error('Current story segment not found');
    }
    
    return currentSegment;
  }
  
  async saveStoryState(userId: string): Promise<void> {
    const storyState = this.storyStates[userId];
    if (!storyState) {
      throw new Error('Story state not found for user');
    }
    
    // Serialize the state
    const serializedState = storyState.toJSON();
    
    // Save to persistent storage
    await this.stateStorage.saveState(userId, serializedState);
  }
  
  async updateUserContext(userId: string, contextData: Record<string, any>): Promise<void> {
    const storyState = await this.getOrCreateStoryState(userId);
    storyState.updateContextualData(contextData);
    await this.saveStoryState(userId);
  }
  
  /**
   * Gets the user's choice history
   */
  async getUserChoiceHistory(userId: string): Promise<any[]> {
    const storyState = await this.getOrCreateStoryState(userId);
    return storyState.choiceHistory;
  }
  
  /**
   * Gets the user's conversation history
   */
  async getConversationHistory(userId: string): Promise<ConversationMessage[]> {
    const storyState = await this.getOrCreateStoryState(userId);
    return storyState.conversationHistory || [];
  }
  
  /**
   * Clear story state for a user (for testing or resetting)
   */
  async clearUserState(userId: string): Promise<void> {
    // Remove from memory
    delete this.storyStates[userId];
    
    // Remove from storage
    await this.stateStorage.deleteState(userId);
  }
  
  /**
   * Get the user context for prompts
   */
  async getUserContext(userId: string): Promise<StoryContext> {
    // Get existing context if any
    const storyState = this.storyStates[userId];
    const existingContext = storyState?.contextualData || {};
    
    // Return base context (personalization will be added later)
    return {
      ...existingContext,
      userId
    };
  }
  
  private loadTemplates(): void {
    try {
      // Load templates from the file system
      const fs = require('fs');
      const path = require('path');
      
      const templatesDir = path.join(__dirname, '../../data/templates');
      
      // Check if directory exists
      if (!fs.existsSync(templatesDir)) {
        console.warn(`Templates directory not found: ${templatesDir}`);
        return;
      }
      
      // Read all JSON files in the templates directory
      const templateFiles = fs.readdirSync(templatesDir)
        .filter((file: string) => file.endsWith('.json'));
      
      if (templateFiles.length === 0) {
        console.warn('No template files found in directory');
        return;
      }
      
      // Load each template
      for (const file of templateFiles) {
        try {
          const templatePath = path.join(templatesDir, file);
          const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
          
          // Create a template instance and add to the collection
          const template = new StoryTemplate(templateData);
          this.storyTemplates[template.id] = template;
          console.log(`Loaded template: ${template.id}`);
        } catch (error) {
          console.error(`Error loading template from ${file}:`, error);
        }
      }
      
      console.log(`Loaded ${Object.keys(this.storyTemplates).length} templates`);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }
  
  private getTemplateForUser(userId: string): StoryTemplate | null {
    // Get available templates
    const templateIds = Object.keys(this.storyTemplates);
    
    if (templateIds.length === 0) {
      return null;
    }
    
    // For simplicity, we'll assign templates based on the user ID
    // In a real implementation, you would select based on user preferences or other factors
    const hash = this.hashCode(userId);
    const templateIndex = Math.abs(hash) % templateIds.length;
    const selectedTemplateId = templateIds[templateIndex];
    
    return this.storyTemplates[selectedTemplateId];
  }
  
  // Helper function to generate a hash code from a string
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
  
  private async getUserVariables(userId: string): Promise<Record<string, any>> {
    // In a real implementation, this would load user-specific variables for template substitution
    // For now, we'll return a default set of variables
    return {
      character_name: 'Adventurer',
      location: 'Mystical Land'
    };
  }
} 