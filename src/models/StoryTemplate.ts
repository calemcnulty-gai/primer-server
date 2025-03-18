import { StorySegment, StoryChoice } from './StoryState';

export type VariableType = 'string' | 'number' | 'boolean';

export interface TemplateVariable {
  name: string;
  type: VariableType;
  required: boolean;
  default?: any;
}

export interface SegmentTemplate {
  id: string;
  template: string;
  choices: {
    id: string;
    text: string;
    nextSegmentId: string;
  }[];
}

export interface StoryTemplateSchema {
  id: string;
  variables: TemplateVariable[];
  segmentTemplates: Record<string, SegmentTemplate>;
}

export class StoryTemplateSchema {
  static validate(schema: any): boolean {
    // Check for required top-level properties
    if (!schema.id || typeof schema.id !== 'string') {
      throw new Error('Schema must have a string id');
    }
    
    if (!Array.isArray(schema.variables)) {
      throw new Error('Schema must have variables array');
    }
    
    if (!schema.segmentTemplates || typeof schema.segmentTemplates !== 'object') {
      throw new Error('Schema must have segmentTemplates object');
    }
    
    // Validate variables
    schema.variables.forEach((variable: any) => {
      if (!variable.name || typeof variable.name !== 'string') {
        throw new Error('Each variable must have a name');
      }
      
      if (!['string', 'number', 'boolean'].includes(variable.type)) {
        throw new Error(`Invalid variable type: ${variable.type}`);
      }
      
      if (typeof variable.required !== 'boolean') {
        throw new Error('Variable required property must be a boolean');
      }
    });
    
    // Validate segment templates
    Object.values(schema.segmentTemplates).forEach((segment: any) => {
      if (!segment.id || typeof segment.id !== 'string') {
        throw new Error('Each segment template must have an id');
      }
      
      if (!segment.template || typeof segment.template !== 'string') {
        throw new Error('Each segment template must have a template string');
      }
      
      if (!Array.isArray(segment.choices)) {
        throw new Error('Each segment template must have a choices array');
      }
      
      segment.choices.forEach((choice: any) => {
        if (!choice.id || typeof choice.id !== 'string') {
          throw new Error('Each choice must have an id');
        }
        
        if (!choice.text || typeof choice.text !== 'string') {
          throw new Error('Each choice must have text');
        }
        
        if (!choice.nextSegmentId || typeof choice.nextSegmentId !== 'string') {
          throw new Error('Each choice must have a nextSegmentId');
        }
      });
    });
    
    return true;
  }
}

export class StoryTemplate {
  id: string;
  variables: TemplateVariable[];
  segmentTemplates: Record<string, SegmentTemplate>;
  
  constructor(schema: StoryTemplateSchema) {
    try {
      StoryTemplateSchema.validate(schema);
    } catch (error) {
      throw new Error(`Invalid story template schema: ${(error as Error).message}`);
    }
    
    this.id = schema.id;
    this.variables = schema.variables;
    this.segmentTemplates = schema.segmentTemplates;
  }
  
  generateSegment(segmentId: string, variables: Record<string, any>): StorySegment {
    // Validate variables against schema
    this.validateVariables(variables);
    
    const segmentTemplate = this.segmentTemplates[segmentId];
    if (!segmentTemplate) {
      throw new Error(`Segment template not found: ${segmentId}`);
    }
    
    // Generate content from template
    const content = this.processTemplate(segmentTemplate.template, variables);
    
    // Process choices
    const choices: StoryChoice[] = segmentTemplate.choices.map(choiceTemplate => ({
      id: choiceTemplate.id,
      text: this.processTemplate(choiceTemplate.text, variables),
      nextSegmentId: choiceTemplate.nextSegmentId
    }));
    
    return {
      id: segmentId,
      content,
      choices
    };
  }
  
  validateVariables(variables: Record<string, any>): void {
    // Check for required variables
    for (const varSchema of this.variables) {
      if (varSchema.required && 
         (variables[varSchema.name] === undefined && varSchema.default === undefined)) {
        throw new Error(`Missing required variable: ${varSchema.name}`);
      }
      
      // Check type if variable is provided
      if (variables[varSchema.name] !== undefined) {
        const expectedType = varSchema.type;
        const actualType = typeof variables[varSchema.name];
        
        let validType = true;
        if (expectedType === 'string' && actualType !== 'string') {
          validType = false;
        } else if (expectedType === 'number' && actualType !== 'number') {
          validType = false;
        } else if (expectedType === 'boolean' && actualType !== 'boolean') {
          validType = false;
        }
        
        if (!validType) {
          throw new Error(`Invalid type for variable: ${varSchema.name}`);
        }
      }
    }
  }
  
  private processTemplate(template: string, variables: Record<string, any>): string {
    // Create a variables object with defaults applied
    const processedVars: Record<string, any> = {};
    
    // Apply default values first
    for (const varSchema of this.variables) {
      if (varSchema.default !== undefined) {
        processedVars[varSchema.name] = varSchema.default;
      }
    }
    
    // Then apply provided values
    Object.assign(processedVars, variables);
    
    // Replace variables in template
    return template.replace(/{([^}]+)}/g, (match, varName) => {
      return processedVars[varName] !== undefined 
        ? String(processedVars[varName]) 
        : match;
    });
  }
} 