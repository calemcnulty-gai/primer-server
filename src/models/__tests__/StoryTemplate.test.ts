import { StoryTemplate, StoryTemplateSchema, TemplateVariable } from '../StoryTemplate';

describe('StoryTemplateSchema', () => {
  it('should validate a template schema', () => {
    const schema: StoryTemplateSchema = {
      id: 'adventure_template',
      variables: [
        { name: 'character_name', type: 'string', required: true },
        { name: 'age', type: 'number', required: false, default: 10 },
        { name: 'location', type: 'string', required: true },
      ],
      segmentTemplates: {
        intro: {
          id: 'intro',
          template: 'Once upon a time, {character_name} was {age} years old and lived in {location}.',
          choices: [
            { id: 'explore', text: 'Explore {location}', nextSegmentId: 'exploration' },
            { id: 'stay_home', text: 'Stay at home', nextSegmentId: 'home' }
          ]
        },
        exploration: {
          id: 'exploration',
          template: '{character_name} decided to explore {location}.',
          choices: []
        },
        home: {
          id: 'home',
          template: '{character_name} decided to stay at home.',
          choices: []
        }
      }
    };
    
    expect(() => StoryTemplateSchema.validate(schema)).not.toThrow();
  });
  
  it('should throw for invalid schema', () => {
    const invalidSchema = {
      id: 'invalid_template',
      // Missing variables
      segmentTemplates: {
        intro: {
          id: 'intro',
          template: 'Invalid template',
          choices: []
        }
      }
    };
    
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow();
  });

  it('should throw when schema id is missing', () => {
    const invalidSchema = {
      variables: [],
      segmentTemplates: {}
    };
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow('Schema must have a string id');
  });

  it('should throw when schema id is not a string', () => {
    const invalidSchema = {
      id: 123,
      variables: [],
      segmentTemplates: {}
    };
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow('Schema must have a string id');
  });

  it('should throw when segmentTemplates is not an object', () => {
    const invalidSchema = {
      id: 'test',
      variables: [],
      segmentTemplates: null
    };
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow('Schema must have segmentTemplates object');
  });

  it('should throw when variable name is missing', () => {
    const invalidSchema = {
      id: 'test',
      variables: [{ type: 'string', required: true }],
      segmentTemplates: {}
    };
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow('Each variable must have a name');
  });

  it('should throw when variable type is invalid', () => {
    const invalidSchema = {
      id: 'test',
      variables: [{ name: 'test', type: 'invalid', required: true }],
      segmentTemplates: {}
    };
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow('Invalid variable type: invalid');
  });

  it('should throw when variable required is not boolean', () => {
    const invalidSchema = {
      id: 'test',
      variables: [{ name: 'test', type: 'string', required: 'yes' }],
      segmentTemplates: {}
    };
    expect(() => StoryTemplateSchema.validate(invalidSchema)).toThrow('Variable required property must be a boolean');
  });
});

describe('StoryTemplate', () => {
  const validSchema: StoryTemplateSchema = {
    id: 'adventure_template',
    variables: [
      { name: 'character_name', type: 'string', required: true },
      { name: 'age', type: 'number', required: false, default: 10 },
      { name: 'location', type: 'string', required: true },
    ],
    segmentTemplates: {
      intro: {
        id: 'intro',
        template: 'Once upon a time, {character_name} was {age} years old and lived in {location}.',
        choices: [
          { id: 'explore', text: 'Explore {location}', nextSegmentId: 'exploration' },
          { id: 'stay_home', text: 'Stay at home', nextSegmentId: 'home' }
        ]
      },
      exploration: {
        id: 'exploration',
        template: '{character_name} decided to explore {location}.',
        choices: []
      },
      home: {
        id: 'home',
        template: '{character_name} decided to stay at home.',
        choices: []
      }
    }
  };
  
  describe('constructor', () => {
    it('should create a template with valid schema', () => {
      const template = new StoryTemplate(validSchema);
      
      expect(template.id).toBe(validSchema.id);
      expect(template.variables).toEqual(validSchema.variables);
      expect(template.segmentTemplates).toEqual(validSchema.segmentTemplates);
    });
    
    it('should throw for invalid schema', () => {
      const invalidSchema = {
        id: 'invalid',
        // Missing required fields
      };
      
      // @ts-ignore - purposely testing with invalid schema
      expect(() => new StoryTemplate(invalidSchema)).toThrow();
    });
  });
  
  describe('generateSegment', () => {
    it('should generate a story segment with provided variables', () => {
      const template = new StoryTemplate(validSchema);
      const variables = {
        character_name: 'Alice',
        location: 'Wonderland'
      };
      
      const segment = template.generateSegment('intro', variables);
      
      expect(segment.id).toBe('intro');
      expect(segment.content).toBe('Once upon a time, Alice was 10 years old and lived in Wonderland.');
      expect(segment.choices.length).toBe(2);
      expect(segment.choices[0].text).toBe('Explore Wonderland');
    });
    
    it('should throw error for missing required variables', () => {
      const template = new StoryTemplate(validSchema);
      const variables = {
        // Missing required character_name
        location: 'Wonderland'
      };
      
      expect(() => template.generateSegment('intro', variables)).toThrow('Missing required variable: character_name');
    });
    
    it('should use default values for optional variables', () => {
      const template = new StoryTemplate(validSchema);
      const variables = {
        character_name: 'Bob',
        location: 'Forest'
        // age is optional with default value
      };
      
      const segment = template.generateSegment('intro', variables);
      
      expect(segment.content).toBe('Once upon a time, Bob was 10 years old and lived in Forest.');
    });
    
    it('should throw error for invalid segment ID', () => {
      const template = new StoryTemplate(validSchema);
      const variables = {
        character_name: 'Charlie',
        location: 'Mountains'
      };
      
      expect(() => template.generateSegment('non_existent', variables)).toThrow('Segment template not found: non_existent');
    });

    const template = new StoryTemplate(validSchema);

    it('should generate a segment with all required variables', () => {
      const segment = template.generateSegment('intro', {
        character_name: 'Alice',
        location: 'Wonderland'
      });

      expect(segment).toEqual({
        id: 'intro',
        content: 'Once upon a time, Alice was 10 years old and lived in Wonderland.',
        choices: [
          { id: 'explore', text: 'Explore Wonderland', nextSegmentId: 'exploration' },
          { id: 'stay_home', text: 'Stay at home', nextSegmentId: 'home' }
        ]
      });
    });

    it('should throw when required variable is missing', () => {
      expect(() => template.generateSegment('intro', {
        character_name: 'Alice'
        // missing required 'location'
      })).toThrow('Missing required variable: location');
    });

    it('should throw when variable type is incorrect', () => {
      expect(() => template.generateSegment('intro', {
        character_name: 123, // should be string
        location: 'Wonderland'
      })).toThrow('Invalid type for variable: character_name');
    });

    it('should throw when segment id does not exist', () => {
      expect(() => template.generateSegment('nonexistent', {
        character_name: 'Alice',
        location: 'Wonderland'
      })).toThrow('Segment template not found: nonexistent');
    });
  });
  
  describe('validateVariables', () => {
    it('should validate variables match schema requirements', () => {
      const template = new StoryTemplate(validSchema);
      const variables = {
        character_name: 'David',
        age: 12,
        location: 'Desert'
      };
      
      expect(() => template.validateVariables(variables)).not.toThrow();
    });
    
    it('should throw for invalid variable types', () => {
      const template = new StoryTemplate(validSchema);
      const variables = {
        character_name: 'Eve',
        age: 'twelve', // Should be a number
        location: 'Beach'
      };
      
      expect(() => template.validateVariables(variables)).toThrow('Invalid type for variable: age');
    });
  });
});

describe('Fantasy Adventure Template', () => {
  let fantasyTemplate: StoryTemplate;
  
  beforeAll(() => {
    const fs = require('fs');
    const path = require('path');
    const templatePath = path.join(__dirname, '../../../data/templates/fantasy_adventure.json');
    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    fantasyTemplate = new StoryTemplate(templateData);
  });

  it('should load the fantasy adventure template', () => {
    expect(fantasyTemplate.id).toBe('fantasy_adventure');
    expect(fantasyTemplate.variables).toHaveLength(3);
    expect(Object.keys(fantasyTemplate.segmentTemplates)).toHaveLength(5);
  });

  it('should generate intro segment with default values', () => {
    const segment = fantasyTemplate.generateSegment('intro', {
      character_name: 'Eldric'
      // character_class and starting_location will use defaults
    });

    expect(segment.id).toBe('intro');
    expect(segment.content).toContain('Eldric');
    expect(segment.content).toContain('adventurer');
    expect(segment.content).toContain('the village of Millbrook');
    expect(segment.choices).toHaveLength(2);
    expect(segment.choices[0].id).toBe('check_notice');
    expect(segment.choices[1].id).toBe('explore_forest');
  });

  it('should generate notice board segment with custom values', () => {
    const segment = fantasyTemplate.generateSegment('notice_board', {
      character_name: 'Lyra',
      character_class: 'ranger',
      starting_location: 'the forest outpost'
    });

    expect(segment.id).toBe('notice_board');
    expect(segment.content).toContain('Lyra');
    expect(segment.choices).toHaveLength(2);
    expect(segment.choices[0].nextSegmentId).toBe('beast_hunt');
    expect(segment.choices[1].nextSegmentId).toBe('courier_mission');
  });

  it('should handle all template variables in beast hunt segment', () => {
    const segment = fantasyTemplate.generateSegment('beast_hunt', {
      character_name: 'Magnus',
      character_class: 'warrior',
      starting_location: 'the mountain keep'
    });

    expect(segment.id).toBe('beast_hunt');
    expect(segment.content).toContain('Magnus');
    expect(segment.content).toContain('warrior');
    expect(segment.choices).toHaveLength(2);
    expect(segment.choices[0].id).toBe('enter_cave');
    expect(segment.choices[1].id).toBe('ask_farmers');
  });
}); 