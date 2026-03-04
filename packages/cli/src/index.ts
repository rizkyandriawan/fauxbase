import { initCommand } from './commands/init';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
      await initCommand();
      break;
    case '--version':
    case '-v':
      console.log('fauxbase-cli 0.4.0');
      break;
    case '--help':
    case '-h':
    case undefined:
      console.log(`
  Usage: fauxbase <command>

  Commands:
    init    Scaffold a new Fauxbase project

  Options:
    -v, --version    Show version
    -h, --help       Show help
`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "fauxbase --help" for usage');
      process.exit(1);
  }
}

main().catch((err) => {
  if (err.name === 'ExitPromptError') {
    // User cancelled with Ctrl+C
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
