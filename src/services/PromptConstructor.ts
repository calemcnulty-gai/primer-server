import { StoryContext } from '../models/StoryContext';

export class PromptConstructor {
  private readonly BASE_STORY_PROMPT = 'You are a creative storyteller. Generate engaging, descriptive story segments for an interactive narrative.';
  private readonly BASE_CHOICES_PROMPT = 'You are a creative storyteller. Generate interesting and meaningful choices that will impact the story direction.';
  
  /**
   * Constructs a prompt for generating a story segment based on the given context
   */
  constructStorySegmentPrompt(context: StoryContext): string {
    let prompt = this.BASE_STORY_PROMPT + '\n\n';
    
    // Add context information
    prompt += this.constructContextSection(context);
    
    // Add story-specific guidelines
    prompt += '\nGuidelines:\n';
    prompt += '- Maintain a consistent narrative style and tone.\n';
    prompt += '- Incorporate the context details naturally into the story.\n';
    prompt += '- Create vivid, engaging scenes that draw the reader in.\n';
    
    if (context.audience) {
      prompt += `- Ensure content is appropriate for ${context.audience} audience.\n`;
    }
    
    if (context.tone) {
      prompt += `- Maintain a ${context.tone} tone throughout the narrative.\n`;
    }
    
    return prompt;
  }
  
  /**
   * Constructs a prompt for generating story choices based on the current context and segment
   */
  constructChoicesPrompt(context: StoryContext, currentSegment: string, numChoices: number): string {
    let prompt = this.BASE_CHOICES_PROMPT + '\n\n';
    
    prompt += `Based on the following story segment, generate exactly ${numChoices} interesting choices for the reader:\n\n`;
    prompt += `"${currentSegment}"\n\n`;
    
    // Add context information
    prompt += this.constructContextSection(context);
    
    // Add choice-specific guidelines
    prompt += '\nChoice Guidelines:\n';
    prompt += `- Generate exactly ${numChoices} distinct choices.\n`;
    prompt += '- Each choice should lead to meaningfully different story directions.\n';
    prompt += '- Choices should be consistent with the established narrative.\n';
    
    if (context.audience) {
      prompt += `- Ensure choices are appropriate for ${context.audience} audience.\n`;
    }
    
    if (context.tone) {
      prompt += `- Maintain ${context.tone} tone in choice descriptions.\n`;
    }
    
    return prompt;
  }
  
  /**
   * Helper method to construct the context section of prompts
   */
  private constructContextSection(context: StoryContext): string {
    let contextSection = 'Context:\n';
    
    // Story style and genre
    if (context.genre) contextSection += `genre: ${context.genre}\n`;
    if (context.tone) contextSection += `tone: ${context.tone}\n`;
    if (context.audience) contextSection += `audience: ${context.audience}\n`;
    
    // Character details
    if (context.character) contextSection += `character: ${context.character}\n`;
    if (context.character_name) contextSection += `character_name: ${context.character_name}\n`;
    if (context.age) contextSection += `age: ${context.age}\n`;
    
    // Setting details
    if (context.setting) contextSection += `setting: ${context.setting}\n`;
    if (context.location) contextSection += `location: ${context.location}\n`;
    
    // Story history
    if (context.previousSegment) contextSection += `previousSegment: ${context.previousSegment}\n`;
    if (context.lastChoice) contextSection += `lastChoice: ${context.lastChoice}\n`;
    if (context.choiceHistory && context.choiceHistory.length > 0) {
      contextSection += 'choiceHistory:\n';
      context.choiceHistory.forEach(choice => {
        contextSection += `  - ${choice}\n`;
      });
    }
    
    return contextSection;
  }
} 