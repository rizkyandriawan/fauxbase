import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { join } from 'node:path';
import { writeFileWithDir } from '../utils';
import {
  entityTemplate,
  userEntityTemplate,
  serviceTemplate,
  userServiceTemplate,
  seedTemplate,
  userSeedTemplate,
  clientTemplate,
  frameworkSetupInstructions,
} from '../templates';

export async function initCommand(): Promise<void> {
  console.log(chalk.bold('\n  Fauxbase — Project Scaffolder\n'));

  // 1. Framework
  const framework = await select({
    message: 'Framework?',
    choices: [
      { name: 'React', value: 'react' },
      { name: 'Vue', value: 'vue' },
      { name: 'Svelte', value: 'svelte' },
      { name: 'None (vanilla TS)', value: 'none' },
    ],
  });

  // 2. Output directory
  const outputDir = await input({
    message: 'Output directory?',
    default: 'src/fauxbase',
  });

  // 3. Sample entity
  const sampleEntity = await confirm({
    message: 'Include sample Todo entity?',
    default: true,
  });

  // 4. Auth
  const auth = await confirm({
    message: 'Include authentication?',
    default: true,
  });

  // 5. Storage
  const storage = await select({
    message: 'Storage backend?',
    choices: [
      { name: 'Memory (default, resets on refresh)', value: 'memory' },
      { name: 'localStorage (persists in browser)', value: 'localStorage' },
      { name: 'IndexedDB (persists, async init)', value: 'indexeddb' },
    ],
  });

  // Generate files
  const cwd = process.cwd();
  const baseDir = join(cwd, outputDir);
  const files: Array<{ path: string; content: string }> = [];

  if (sampleEntity) {
    files.push(
      { path: join(baseDir, 'entities/todo.ts'), content: entityTemplate('todo') },
      { path: join(baseDir, 'services/todo.ts'), content: serviceTemplate('todo') },
      { path: join(baseDir, 'seeds/todo.ts'), content: seedTemplate('todo') },
    );
  }

  if (auth) {
    files.push(
      { path: join(baseDir, 'entities/user.ts'), content: userEntityTemplate() },
      { path: join(baseDir, 'services/user.ts'), content: userServiceTemplate() },
      { path: join(baseDir, 'seeds/user.ts'), content: userSeedTemplate() },
    );
  }

  files.push({
    path: join(baseDir, 'index.ts'),
    content: clientTemplate({ framework, sampleEntity, auth, storage }),
  });

  // Write files
  for (const file of files) {
    await writeFileWithDir(file.path, file.content);
    const relative = file.path.replace(cwd + '/', '');
    console.log(chalk.green('  created ') + relative);
  }

  // Install instructions
  const deps = ['fauxbase'];
  if (framework === 'react') deps.push('fauxbase-react');
  if (framework === 'vue') deps.push('fauxbase-vue');
  if (framework === 'svelte') deps.push('fauxbase-svelte');

  console.log(chalk.bold('\n  Next steps:\n'));
  console.log(chalk.cyan(`  npm install ${deps.join(' ')}`));

  if (framework !== 'none') {
    console.log(frameworkSetupInstructions(framework, outputDir));
  }

  console.log('');
}
