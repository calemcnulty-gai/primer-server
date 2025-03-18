import { Response } from 'express';
import * as Express from 'express';
import { StoryStateService } from '../services/StoryStateService';
import { GPTClient } from '../services/GPTClient';
import { StorySegment, StoryChoice, StoryState } from '../models/StoryState';
import { AuthenticatedUser } from '../models/Auth';
import { PersonalizationManager } from '../services/PersonalizationManager';
import { RequestWithUser } from '../types/express';

export class StoryController {
  private storyStateService: StoryStateService;
  private personalizationManager: PersonalizationManager;
  private gptClient: GPTClient;
  
  constructor(
    storyStateService: StoryStateService,
    personalizationManager?: PersonalizationManager,
    gptClient?: GPTClient
  ) {
    this.storyStateService = storyStateService;
    this.personalizationManager = personalizationManager || new PersonalizationManager();
    this.gptClient = gptClient || this.storyStateService.getGPTClient();
  }
  
  /**
   * Get the current story state and segment for a user
   * @route GET /api/story/current
   */
  async getCurrentStory(req: RequestWithUser, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`[StoryController] Starting getCurrentStory`);
    
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = req.user?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized - User ID or Device ID required' });
        return;
      }
      console.log(`[StoryController] Processing request for userId: ${userId}`);

      const getStateStartTime = Date.now();
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);
      console.log(`[StoryController] getOrCreateStoryState completed in ${Date.now() - getStateStartTime}ms`);
      
      const currentSegment = storyState.getCurrentSegment();

      if (!currentSegment) {
        console.log(`[StoryController] No current segment found, generating initial segment`);
        
        const generateStartTime = Date.now();
        const segment = await this.storyStateService.generateInitialStorySegment(userId);
        console.log(`[StoryController] generateInitialStorySegment completed in ${Date.now() - generateStartTime}ms`);
        
        // Mark the segment as viewed
        const saveStartTime = Date.now();
        storyState.markSegmentAsRead(segment.id);
        await this.storyStateService.saveStoryState(userId);
        console.log(`[StoryController] saveStoryState completed in ${Date.now() - saveStartTime}ms`);
        
        res.json({
          success: true,
          segment: this.formatStorySegment(segment),
          state: storyState.getPublicState()
        });
      } else {
        console.log(`[StoryController] Current segment found id: ${currentSegment.id}`);
        
        // Mark the segment as viewed
        const saveStartTime = Date.now();
        storyState.markSegmentAsRead(currentSegment.id);
        await this.storyStateService.saveStoryState(userId);
        console.log(`[StoryController] saveStoryState completed in ${Date.now() - saveStartTime}ms`);
        
        res.json({
          success: true,
          segment: this.formatStorySegment(currentSegment),
          state: storyState.getPublicState()
        });
      }
      
      console.log(`[StoryController] getCurrentStory completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[StoryController] Error getting current story (${Date.now() - startTime}ms):`, error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get current story state',
        message: (error as Error).message 
      });
    }
  }
  
  /**
   * Process a user's choice and progress the story
   * @route POST /api/story/choice
   */
  async makeChoice(req: RequestWithUser, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`[StoryController] Starting makeChoice`);
    
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = req.user?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required' 
        });
        return;
      }

      const { choiceId } = req.body;
      if (!choiceId) {
        res.status(400).json({ 
          success: false,
          error: 'Choice ID is required' 
        });
        return;
      }
      console.log(`[StoryController] Processing choice ${choiceId} for userId: ${userId}`);

      // Generate the next segment based on the choice
      const generateStartTime = Date.now();
      console.log(`[StoryController] Starting generateNextSegment`);
      const nextSegment = await this.storyStateService.generateNextSegment(userId, choiceId);
      console.log(`[StoryController] generateNextSegment completed in ${Date.now() - generateStartTime}ms`);
      
      // Get the updated state
      const getStateStartTime = Date.now();
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);
      console.log(`[StoryController] getOrCreateStoryState completed in ${Date.now() - getStateStartTime}ms`);
      
      // Mark the new segment as viewed
      const saveStartTime = Date.now();
      storyState.markSegmentAsRead(nextSegment.id);
      await this.storyStateService.saveStoryState(userId);
      console.log(`[StoryController] saveStoryState completed in ${Date.now() - saveStartTime}ms`);

      res.json({
        success: true,
        segment: this.formatStorySegment(nextSegment),
        state: storyState.getPublicState()
      });
      
      console.log(`[StoryController] makeChoice completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[StoryController] Error processing choice (${Date.now() - startTime}ms):`, error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to process story choice',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Handle open-ended conversational storytelling
   * @route POST /api/story/converse
   */
  async converseWithStory(req: RequestWithUser, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`[StoryController] Starting converseWithStory`);
    
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = req.user?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required' 
        });
        return;
      }

      const { userInput } = req.body;
      if (!userInput) {
        res.status(400).json({ 
          success: false,
          error: 'User input is required' 
        });
        return;
      }
      console.log(`[StoryController] Processing conversation input for userId: ${userId}`);

      // Get the user's story state
      const getStateStartTime = Date.now();
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);
      console.log(`[StoryController] getOrCreateStoryState completed in ${Date.now() - getStateStartTime}ms`);
      
      // Get user context for the conversation
      const contextStart = Date.now();
      const userContext = await this.storyStateService.getUserContext(userId);
      
      // Add the current conversation
      userContext.userInput = userInput;
      
      // Add conversation history if any
      if (!storyState.conversationHistory) {
        storyState.conversationHistory = [];
      }
      
      // Keep a reasonable history size (last 10 exchanges)
      if (storyState.conversationHistory.length > 20) {
        storyState.conversationHistory = storyState.conversationHistory.slice(-20);
      }
      
      // Add latest user input to history
      storyState.conversationHistory.push({
        role: 'user',
        content: userInput,
        timestamp: new Date()
      });
      
      userContext.conversationHistory = storyState.conversationHistory;
      console.log(`[StoryController] Context prepared in ${Date.now() - contextStart}ms`);

      // Enrich context with personalization
      const enrichStart = Date.now();
      const enrichedContext = await this.personalizationManager.enrichContext(userContext);
      console.log(`[StoryController] Context enrichment completed in ${Date.now() - enrichStart}ms`);
      
      // Check if streaming is requested
      const useStreaming = req.query.stream === 'true' || req.body.stream === true;
      
      // Generate a unique ID for this exchange
      const exchangeId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      // Prepare the prompt for story generation
      const prompt = `Continue this interactive story based on the user's input: "${userInput}".
                    Respond directly as the narrator, crafting a vivid, engaging continuation of the story that
                    incorporates the user's input naturally. Keep the response concise (2-4 paragraphs) and engaging.
                    Don't refer to the user's input directly or use phrases like "based on what you said".
                    Instead, weave their contribution seamlessly into the narrative.`;
      
      if (useStreaming) {
        // Set up streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Inform client we're starting
        res.write(`data: ${JSON.stringify({ 
          id: exchangeId, 
          type: 'init', 
          isConversational: true 
        })}\n\n`);
        
        // Full story response for state saving
        let fullStoryResponse = '';
        
        // Setup streaming callback
        const onChunk = (chunk: string) => {
          // Add to the full response
          fullStoryResponse += chunk;
          
          // Send this chunk to the client
          res.write(`data: ${JSON.stringify({ 
            id: exchangeId, 
            type: 'chunk', 
            content: chunk 
          })}\n\n`);
        };
        
        // Generate story with streaming
        console.log(`[StoryController] Starting streamed story response generation`);
        const generateStart = Date.now();
        
        await this.gptClient.streamStorySegment({
          prompt,
          context: enrichedContext,
          onChunk
        });
        
        console.log(`[StoryController] Streamed story response completed in ${Date.now() - generateStart}ms`);
        
        // Add the response to conversation history
        storyState.conversationHistory.push({
          role: 'assistant',
          content: fullStoryResponse,
          timestamp: new Date()
        });
        
        // Create a story segment to maintain compatibility with existing frontend
        const conversationSegment: StorySegment = {
          id: exchangeId,
          content: fullStoryResponse,
          choices: [] // No choices in conversational mode
        };
        
        // Add to segments for historical tracking
        storyState.addSegment(conversationSegment);
        storyState.currentSegmentId = exchangeId;
        
        // Save the updated state
        const saveStart = Date.now();
        await this.storyStateService.saveStoryState(userId);
        console.log(`[StoryController] State saved in ${Date.now() - saveStart}ms`);
        
        // Send completion event with state
        res.write(`data: ${JSON.stringify({ 
          id: exchangeId, 
          type: 'done', 
          state: storyState.getPublicState() 
        })}\n\n`);
        
        // End the response
        res.end();
      } else {
        // Non-streaming response
        console.log(`[StoryController] Starting non-streamed story response generation`);
        const generateStart = Date.now();
        
        const storyResponse = await this.gptClient.generateStorySegment({
          prompt,
          context: enrichedContext
        });
        
        console.log(`[StoryController] Story response generated in ${Date.now() - generateStart}ms`);
        
        // Add the response to conversation history
        storyState.conversationHistory.push({
          role: 'assistant',
          content: storyResponse,
          timestamp: new Date()
        });
        
        // Create a story segment to maintain compatibility with existing frontend
        const conversationSegment: StorySegment = {
          id: exchangeId,
          content: storyResponse,
          choices: [] // No choices in conversational mode
        };
        
        // Add to segments for historical tracking
        storyState.addSegment(conversationSegment);
        storyState.currentSegmentId = exchangeId;
        
        // Save the updated state
        const saveStart = Date.now();
        await this.storyStateService.saveStoryState(userId);
        console.log(`[StoryController] State saved in ${Date.now() - saveStart}ms`);
        
        res.json({
          success: true,
          segment: {
            id: exchangeId,
            content: storyResponse,
            // No choices in conversational mode, but maintain API compatibility
            choices: []
          },
          state: storyState.getPublicState(),
          isConversational: true
        });
      }
      
      console.log(`[StoryController] converseWithStory completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[StoryController] Error in conversation (${Date.now() - startTime}ms):`, error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to process conversational input',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Start a new conversational story
   * @route POST /api/story/conversation/start
   */
  async startConversation(req: RequestWithUser, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`[StoryController] Starting new conversation`);
    
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = req.user?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required' 
        });
        return;
      }
      
      // Get preferences from request if any
      const { preferences } = req.body || {};
      console.log(`[StoryController] Starting conversation for userId: ${userId}`);
      
      // Check if streaming is requested
      const useStreaming = req.query.stream === 'true' || req.body.stream === true;
      
      // Clear existing state first
      const clearStateStartTime = Date.now();
      await this.storyStateService.clearUserState(userId);
      console.log(`[StoryController] clearUserState completed in ${Date.now() - clearStateStartTime}ms`);
      
      // Create new state
      const storyState = new StoryState(userId);
      
      // Initialize conversation history
      storyState.conversationHistory = [];
      
      // Set to conversational mode
      storyState.enableConversationalMode();
      
      // Add user preferences if provided
      if (preferences) {
        storyState.updateContextualData(preferences);
        await this.personalizationManager.updateUserPreferences(userId, preferences);
      }
      
      // Store the state
      this.storyStateService.storeState(userId, storyState);
      
      // Prepare the context for initial story prompt
      const contextStart = Date.now();
      const userContext = await this.storyStateService.getUserContext(userId);
      const enrichedContext = await this.personalizationManager.enrichContext(userContext);
      console.log(`[StoryController] Context preparation completed in ${Date.now() - contextStart}ms`);
      
      // Create a segment ID for the introduction
      const introId = 'conv_intro';
      
      // Prepare the story prompt
      const prompt = `Create a brief, engaging introduction to an interactive story. 
                      Set the scene and atmosphere in 2-3 paragraphs, but don't introduce specific characters yet 
                      as the user will help shape the story. End with an open-ended prompt that invites the user to 
                      contribute to what happens next. Do not present choices - this is a fully interactive story.`;
      
      if (useStreaming) {
        // Set up streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Inform client we're starting
        res.write(`data: ${JSON.stringify({ 
          id: introId, 
          type: 'init', 
          isConversational: true 
        })}\n\n`);
        
        // Full story response for state saving
        let fullStoryIntro = '';
        
        // Setup streaming callback
        const onChunk = (chunk: string) => {
          // Add to the full response
          fullStoryIntro += chunk;
          
          // Send this chunk to the client
          res.write(`data: ${JSON.stringify({ 
            id: introId, 
            type: 'chunk', 
            content: chunk 
          })}\n\n`);
        };
        
        // Generate story with streaming
        console.log(`[StoryController] Starting streamed story introduction generation`);
        const generateStart = Date.now();
        
        await this.gptClient.streamStorySegment({
          prompt,
          context: enrichedContext,
          onChunk
        });
        
        console.log(`[StoryController] Streamed story introduction completed in ${Date.now() - generateStart}ms`);
        
        // Create a segment for the introduction
        const introSegment: StorySegment = {
          id: introId,
          content: fullStoryIntro,
          choices: [] // No choices in conversational mode
        };
        
        // Add to state
        storyState.addSegment(introSegment);
        storyState.currentSegmentId = introId;
        
        // Add to conversation history
        storyState.conversationHistory.push({
          role: 'assistant',
          content: fullStoryIntro,
          timestamp: new Date()
        });
        
        // Save state
        const saveStart = Date.now();
        await this.storyStateService.saveStoryState(userId);
        console.log(`[StoryController] State saved in ${Date.now() - saveStart}ms`);
        
        // Send completion event with state
        res.write(`data: ${JSON.stringify({ 
          id: introId, 
          type: 'done', 
          state: storyState.getPublicState() 
        })}\n\n`);
        
        // End the response
        res.end();
      } else {
        // Generate the initial story introduction (non-streaming)
        const generateStart = Date.now();
        const storyIntro = await this.gptClient.generateStorySegment({
          prompt,
          context: enrichedContext
        });
        console.log(`[StoryController] Initial story generated in ${Date.now() - generateStart}ms`);
        
        // Create a segment for the introduction
        const introSegment: StorySegment = {
          id: introId,
          content: storyIntro,
          choices: [] // No choices in conversational mode
        };
        
        // Add to state
        storyState.addSegment(introSegment);
        storyState.currentSegmentId = introId;
        
        // Add to conversation history
        storyState.conversationHistory.push({
          role: 'assistant',
          content: storyIntro,
          timestamp: new Date()
        });
        
        // Save state
        const saveStart = Date.now();
        await this.storyStateService.saveStoryState(userId);
        console.log(`[StoryController] State saved in ${Date.now() - saveStart}ms`);
        
        res.json({
          success: true,
          segment: {
            id: introId,
            content: storyIntro,
            choices: [] // No choices in conversational mode
          },
          state: storyState.getPublicState(),
          isConversational: true
        });
      }
      
      console.log(`[StoryController] startConversation completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[StoryController] Error starting conversation (${Date.now() - startTime}ms):`, error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to start conversational story',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Update story progress (e.g., mark segments as read, update user preferences)
   * @route POST /api/story/progress
   */
  async updateProgress(req: RequestWithUser, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`[StoryController] Starting updateProgress`);
    
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = req.user?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({ 
          success: false,
          error: 'Unauthorized - User ID or Device ID required' 
        });
        return;
      }

      const { segmentId, preferences } = req.body;
      if (!segmentId) {
        res.status(400).json({ 
          success: false,
          error: 'Segment ID is required' 
        });
        return;
      }
      console.log(`[StoryController] Updating progress for userId: ${userId}, segmentId: ${segmentId}`);

      const getStateStartTime = Date.now();
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);
      console.log(`[StoryController] getOrCreateStoryState completed in ${Date.now() - getStateStartTime}ms`);
      
      // Mark segment as read
      storyState.markSegmentAsRead(segmentId);
      
      // Update user preferences if provided
      if (preferences) {
        console.log(`[StoryController] Updating user preferences`);
        storyState.updateContextualData(preferences);
        
        // Update personalization engine with preferences
        const prefUpdateStartTime = Date.now();
        await this.personalizationManager.updateUserPreferences(userId, preferences);
        console.log(`[StoryController] updateUserPreferences completed in ${Date.now() - prefUpdateStartTime}ms`);
      }
      
      // Save updates to storage
      const saveStartTime = Date.now();
      await this.storyStateService.saveStoryState(userId);
      console.log(`[StoryController] saveStoryState completed in ${Date.now() - saveStartTime}ms`);

      res.json({
        success: true,
        state: storyState.getPublicState()
      });
      
      console.log(`[StoryController] updateProgress completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[StoryController] Error updating progress (${Date.now() - startTime}ms):`, error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to update story progress',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Reset user's story state (for testing or starting over)
   * @route POST /api/story/reset
   */
  async resetStory(req: RequestWithUser, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`[StoryController] Starting resetStory`);
    
    try {
      // For demo purposes, use deviceId if user auth not available
      const userId = req.user?.id || req.header('X-Device-ID');
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized - User ID or Device ID required'
        });
        return;
      }
      console.log(`[StoryController] Resetting story for userId: ${userId}`);
      
      // Clear the user's state
      const clearStateStartTime = Date.now();
      await this.storyStateService.clearUserState(userId);
      console.log(`[StoryController] clearUserState completed in ${Date.now() - clearStateStartTime}ms`);
      
      // Get a fresh initial state
      const getStateStartTime = Date.now();
      const storyState = await this.storyStateService.getOrCreateStoryState(userId);
      console.log(`[StoryController] getOrCreateStoryState completed in ${Date.now() - getStateStartTime}ms`);
      
      const currentSegment = storyState.getCurrentSegment();
      
      // Return the new initial segment
      res.status(200).json({
        success: true,
        message: 'Story reset successfully',
        segment: currentSegment ? this.formatStorySegment(currentSegment) : null,
        state: storyState.getPublicState()
      });
      
      console.log(`[StoryController] resetStory completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[StoryController] Error resetting story (${Date.now() - startTime}ms):`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset story',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Format a story segment for API response
   */
  private formatStorySegment(segment: StorySegment): any {
    return {
      id: segment.id,
      content: segment.content,
      choices: segment.choices.map(choice => ({
        id: choice.id,
        text: choice.text
      }))
    };
  }
} 