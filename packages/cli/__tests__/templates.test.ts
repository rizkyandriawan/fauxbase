import { describe, it, expect } from 'vitest';
import {
  entityTemplate,
  userEntityTemplate,
  serviceTemplate,
  userServiceTemplate,
  seedTemplate,
  userSeedTemplate,
  clientTemplate,
  frameworkSetupInstructions,
} from '../src/templates';

describe('entityTemplate', () => {
  it('generates entity with capitalized name', () => {
    const result = entityTemplate('todo');
    expect(result).toContain('class Todo extends Entity');
    expect(result).toContain("import { Entity, field } from 'fauxbase'");
    expect(result).toContain('@field({ required: true }) title!: string');
  });
});

describe('userEntityTemplate', () => {
  it('generates user entity with auth fields', () => {
    const result = userEntityTemplate();
    expect(result).toContain('class User extends Entity');
    expect(result).toContain('email!: string');
    expect(result).toContain('password!: string');
    expect(result).toContain("role!: string");
  });
});

describe('serviceTemplate', () => {
  it('generates service for entity', () => {
    const result = serviceTemplate('todo');
    expect(result).toContain('class TodoService extends Service<Todo>');
    expect(result).toContain("import { Todo } from '../entities/todo'");
    expect(result).toContain("endpoint = '/todos'");
  });
});

describe('userServiceTemplate', () => {
  it('generates auth service', () => {
    const result = userServiceTemplate();
    expect(result).toContain('class UserAuth extends AuthService<User>');
    expect(result).toContain("import { AuthService } from 'fauxbase'");
  });
});

describe('seedTemplate', () => {
  it('generates seed with entity', () => {
    const result = seedTemplate('todo');
    expect(result).toContain("import { seed } from 'fauxbase'");
    expect(result).toContain('export const todoSeed = seed(Todo,');
    expect(result).toContain("import { Todo } from '../entities/todo'");
  });
});

describe('userSeedTemplate', () => {
  it('generates user seed data', () => {
    const result = userSeedTemplate();
    expect(result).toContain('export const userSeed = seed(User,');
    expect(result).toContain("email: 'admin@example.com'");
  });
});

describe('clientTemplate', () => {
  it('generates basic client with memory storage', () => {
    const result = clientTemplate({
      framework: 'none',
      sampleEntity: false,
      auth: false,
      storage: 'memory',
    });
    expect(result).toContain("import { createClient } from 'fauxbase'");
    expect(result).toContain('export const fb = createClient(');
    expect(result).not.toContain('persist');
  });

  it('includes localStorage driver config', () => {
    const result = clientTemplate({
      framework: 'none',
      sampleEntity: false,
      auth: false,
      storage: 'localStorage',
    });
    expect(result).toContain("persist: 'localStorage'");
  });

  it('includes indexeddb driver config', () => {
    const result = clientTemplate({
      framework: 'none',
      sampleEntity: false,
      auth: false,
      storage: 'indexeddb',
    });
    expect(result).toContain("persist: 'indexeddb'");
  });

  it('includes todo service and seed', () => {
    const result = clientTemplate({
      framework: 'react',
      sampleEntity: true,
      auth: false,
      storage: 'memory',
    });
    expect(result).toContain("import { TodoService } from './services/todo'");
    expect(result).toContain("import { todoSeed } from './seeds/todo'");
    expect(result).toContain('todo: TodoService');
    expect(result).toContain('seeds: [todoSeed]');
  });

  it('includes auth service', () => {
    const result = clientTemplate({
      framework: 'react',
      sampleEntity: false,
      auth: true,
      storage: 'memory',
    });
    expect(result).toContain("import { UserAuth } from './services/user'");
    expect(result).toContain('auth: UserAuth');
  });

  it('includes both todo and auth', () => {
    const result = clientTemplate({
      framework: 'react',
      sampleEntity: true,
      auth: true,
      storage: 'localStorage',
    });
    expect(result).toContain('todo: TodoService');
    expect(result).toContain('auth: UserAuth');
    expect(result).toContain('todoSeed, userSeed');
  });
});

describe('frameworkSetupInstructions', () => {
  it('returns React instructions', () => {
    const result = frameworkSetupInstructions('react', 'src/fauxbase');
    expect(result).toContain('FauxbaseProvider');
    expect(result).toContain('fauxbase-react');
  });

  it('returns Vue instructions', () => {
    const result = frameworkSetupInstructions('vue', 'src/fauxbase');
    expect(result).toContain('FauxbasePlugin');
    expect(result).toContain('fauxbase-vue');
  });

  it('returns Svelte instructions', () => {
    const result = frameworkSetupInstructions('svelte', 'src/fauxbase');
    expect(result).toContain('setFauxbaseContext');
    expect(result).toContain('fauxbase-svelte');
  });

  it('returns vanilla instructions for none', () => {
    const result = frameworkSetupInstructions('none', 'src/fauxbase');
    expect(result).toContain('Import and use directly');
  });
});
