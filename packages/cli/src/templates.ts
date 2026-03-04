// --- Code generation templates ---

export function entityTemplate(name: string): string {
  const className = capitalize(name);
  return `import { Entity, field } from 'fauxbase';

export class ${className} extends Entity {
  @field({ required: true }) title!: string;
  @field({ default: false }) done!: boolean;
}
`;
}

export function userEntityTemplate(): string {
  return `import { Entity, field } from 'fauxbase';

export class User extends Entity {
  @field({ required: true }) name!: string;
  @field({ required: true }) email!: string;
  @field({ required: true }) password!: string;
  @field({ default: 'user' }) role!: string;
}
`;
}

export function serviceTemplate(name: string): string {
  const className = capitalize(name);
  return `import { Service } from 'fauxbase';
import { ${className} } from '../entities/${name}';

export class ${className}Service extends Service<${className}> {
  entity = ${className};
  endpoint = '/${name}s';
}
`;
}

export function userServiceTemplate(): string {
  return `import { AuthService } from 'fauxbase';
import { User } from '../entities/user';

export class UserAuth extends AuthService<User> {
  entity = User;
  endpoint = '/users';
}
`;
}

export function seedTemplate(name: string): string {
  const className = capitalize(name);
  return `import { seed } from 'fauxbase';
import { ${className} } from '../entities/${name}';

export const ${name}Seed = seed(${className}, [
  { title: 'Sample ${name} 1', done: false },
  { title: 'Sample ${name} 2', done: true },
]);
`;
}

export function userSeedTemplate(): string {
  return `import { seed } from 'fauxbase';
import { User } from '../entities/user';

export const userSeed = seed(User, [
  { name: 'Admin', email: 'admin@example.com', password: 'admin123', role: 'admin' },
  { name: 'User', email: 'user@example.com', password: 'user123', role: 'user' },
]);
`;
}

export function clientTemplate(options: {
  framework: string;
  sampleEntity: boolean;
  auth: boolean;
  storage: string;
}): string {
  const imports: string[] = ["import { createClient } from 'fauxbase';"];
  const serviceImports: string[] = [];
  const seedImports: string[] = [];
  const services: string[] = [];
  const seeds: string[] = [];

  if (options.sampleEntity) {
    serviceImports.push("import { TodoService } from './services/todo';");
    seedImports.push("import { todoSeed } from './seeds/todo';");
    services.push('todo: TodoService');
    seeds.push('todoSeed');
  }

  if (options.auth) {
    serviceImports.push("import { UserAuth } from './services/user';");
    seedImports.push("import { userSeed } from './seeds/user';");
    seeds.push('userSeed');
  }

  const allImports = [imports[0], ...serviceImports, ...seedImports].join('\n');

  const driverConfig = options.storage === 'memory'
    ? ''
    : `\n  driver: { type: 'local', persist: '${options.storage}' },`;

  const servicesStr = services.length > 0
    ? `\n  services: { ${services.join(', ')} },`
    : '\n  services: {},';

  const seedsStr = seeds.length > 0
    ? `\n  seeds: [${seeds.join(', ')}],`
    : '';

  const authStr = options.auth ? '\n  auth: UserAuth,' : '';

  return `${allImports}

export const fb = createClient({${driverConfig}${servicesStr}${seedsStr}${authStr}
});
`;
}

export function frameworkSetupInstructions(framework: string, outputDir: string): string {
  switch (framework) {
    case 'react':
      return `
  // In your App.tsx:
  import { FauxbaseProvider } from 'fauxbase-react';
  import { fb } from './${outputDir.replace(/^src\//, '')}';

  function App() {
    return (
      <FauxbaseProvider client={fb}>
        {/* your components */}
      </FauxbaseProvider>
    );
  }`;

    case 'vue':
      return `
  // In your main.ts:
  import { FauxbasePlugin } from 'fauxbase-vue';
  import { fb } from './${outputDir.replace(/^src\//, '')}';

  app.use(FauxbasePlugin, { client: fb });`;

    case 'svelte':
      return `
  <!-- In your root +layout.svelte or App.svelte: -->
  <script>
    import { setFauxbaseContext } from 'fauxbase-svelte';
    import { fb } from './${outputDir.replace(/^src\//, '')}';

    setFauxbaseContext(fb);
  </script>`;

    default:
      return `
  // Import and use directly:
  import { fb } from './${outputDir.replace(/^src\//, '')}';

  const products = await fb.product.list();`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
