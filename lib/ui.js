import figlet from 'figlet';
import chalk from 'chalk';
import inquirer from 'inquirer';
import gradient from 'gradient-string';

export function printHeader(clear = true) {
  if (clear) console.clear();
  const titleLines = figlet.textSync('CINEBLOCK', { font: 'ANSI Shadow', width: process.stdout.columns || 220 }).split('\n');
  const H = titleLines.length;
  const block = '████';
  const innerH = H - 1; // only skip last row — moves it up
  const innerHalf = Math.ceil(innerH / 2);
  const maxIndent = (innerHalf - 1) * 2;
  const arrowWidth = maxIndent + block.length + 2;
  const arrowLines = Array.from({ length: H }, (_, i) => {
    if (i === H - 1) return ' '.repeat(arrowWidth);
    const dist = i < innerHalf ? i : innerH - 1 - i;
    const indent = dist * 2;
    return (' '.repeat(indent) + block).padEnd(arrowWidth);
  });
  const logo = Array.from({ length: H }, (_, i) => {
    return arrowLines[i] + (titleLines[i] ?? '');
  }).join('\n');

  const cineGradient = gradient(['#FFCC00', '#FF3300']);
  console.log(cineGradient.multiline(logo));

  console.log(chalk.hex('#444444')('  Tips for getting started:'));
  console.log(chalk.hex('#333333')('  1. Choose AI natural-language search or Guided no-AI search'));
  console.log(chalk.hex('#333333')('  2. AI mode needs your own provider API key; Guided mode does not'));
  console.log(chalk.hex('#333333')('  3. Use /login or /key from the mode menu to update credentials'));
  console.log(chalk.hex('#333333')('  4. /help for more information\n'));
}

export function printError(msg) {
  console.log('\n' + chalk.bgHex('#FF0000').hex('#FFFFFF').bold(` ✖ ERROR `) + ` ${msg}\n`);
}

export function printInfo(msg) {
  console.log('\n' + chalk.bgHex('#00FFCC').hex('#000000').bold(` ℹ INFO `) + ` ${msg}\n`);
}

export async function promptCliToken() {
  console.log('\n' + chalk.hex('#FF9900').bold('  CineBlock Terminal requires a login token.'));
  console.log(chalk.hex('#555555')('  → Go to https://cineblock.in/profile and click "Generate CLI Token"\n'));
  const { token } = await inquirer.prompt([{
    type: 'password',
    name: 'token',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#FFCC00').bold('  Paste your CLI token:'),
    mask: '*',
    validate: (val) => val.trim().startsWith('cb_') || 'Token should start with cb_ — copy it from your CineBlock profile.',
  }]);
  return token.trim();
}

export async function promptApiKey() {
  const { key } = await inquirer.prompt([{
    type: 'password',
    name: 'key',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#FFCC00').bold('Enter your AI API key (only needed for AI mode):'),
    mask: '*',
    validate: (val) => val.trim().length > 10 || 'Key looks too short — paste the full key.',
  }]);
  return key.trim();
}

export async function promptSearchMode() {
  const { mode } = await inquirer.prompt([{
    type: 'rawlist',
    name: 'mode',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#FFCC00').bold('CHOOSE SEARCH MODE:'),
    choices: [
      { name: chalk.hex('#FF9900').bold('🧠  AI natural-language search') + chalk.hex('#777777')(' — describe any mood or similarity'), value: 'ai' },
      { name: chalk.hex('#00FFCC').bold('🎛  Guided no-AI search') + chalk.hex('#777777')(' — answer 3 questions, get 5 picks'), value: 'guided' },
      { name: chalk.hex('#AAAAAA')('🔑  Update CLI token'), value: 'login' },
      { name: chalk.hex('#AAAAAA')('⚙  Update AI API key'), value: 'key' },
      { name: chalk.hex('#AAAAAA')('?  Help'), value: 'help' },
      { name: chalk.hex('#444444')('🚪  Exit'), value: 'exit' },
    ],
  }]);
  return mode;
}

export async function promptNaturalLanguage() {
  process.stdout.write('\n');
  const { query } = await inquirer.prompt([{
    type: 'input',
    name: 'query',
    prefix: '',
    theme: { prefix: '' },
    message: gradient(['#FFCC00', '#FF3300'])('Describe the movies you want >'),
    validate: (val) => val.trim().length > 0 || 'Describe a mood, genre, era, or similar movie.',
  }]);
  return query.trim();
}

export async function promptGuidedSearch() {
  const { keywordId } = await inquirer.prompt([{
    type: 'rawlist',
    name: 'keywordId',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#00FFCC').bold('1/3  What story signal should guide the picks?'),
    choices: [
      { name: 'Any story signal', value: null },
      { name: 'Time Loop', value: 10854 },
      { name: 'Based on a Novel', value: 818 },
      { name: 'True Story', value: 9672 },
      { name: 'Found Footage', value: 11308 },
      { name: 'Dystopia', value: 4565 },
      { name: 'Post-Apocalyptic', value: 4458 },
      { name: 'Heist', value: 10349 },
      { name: 'Road Trip', value: 1721 },
      { name: 'Coming of Age', value: 10683 },
      { name: 'Survival', value: 5565 },
      { name: 'Cult Classic', value: 12554 },
      { name: 'Mind Bending', value: 4344 },
      { name: 'Tear Jerker', value: 11800 },
      { name: 'Feel Good', value: 15060 },
      { name: 'Dark Humour', value: 10941 },
      { name: 'Plot Twist', value: 3801 },
      { name: 'Slow Burn', value: 282 },
      { name: 'Revenge', value: 3995 },
      { name: 'Unlikely Duo', value: 3265 },
      { name: 'Found Family', value: 193498 },
      { name: 'Antihero', value: 9748 },
      { name: 'Space Travel', value: 803 },
      { name: 'Parallel Universe', value: 207317 },
      { name: 'Artificial Intelligence', value: 9951 },
      { name: 'Time Travel', value: 4379 },
      { name: 'Underwater', value: 11322 },
      { name: 'K-Drama', value: 318385 },
      { name: 'C-Drama', value: 292014 },
    ],
  }]);

  const { languages } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'languages',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#00FFCC').bold('2/3  Which original languages should we prioritize?'),
    choices: [
      { name: 'Any language', value: 'any', checked: true },
      { name: 'English', value: 'en' },
      { name: 'Hindi', value: 'hi' },
      { name: 'Tamil', value: 'ta' },
      { name: 'Telugu', value: 'te' },
      { name: 'Malayalam', value: 'ml' },
      { name: 'Kannada', value: 'kn' },
      { name: 'Spanish', value: 'es' },
      { name: 'French', value: 'fr' },
      { name: 'German', value: 'de' },
      { name: 'Japanese', value: 'ja' },
      { name: 'Korean', value: 'ko' },
      { name: 'Chinese', value: 'zh' },
      { name: 'Italian', value: 'it' },
      { name: 'Portuguese', value: 'pt' },
      { name: 'Russian', value: 'ru' },
      { name: 'Arabic', value: 'ar' },
      { name: 'Turkish', value: 'tr' },
      { name: 'Indonesian', value: 'id' },
      { name: 'Thai', value: 'th' },
    ],
    validate: (value) => value.length > 0 || 'Choose Any language or at least one language.',
  }]);

  const currentYear = new Date().getFullYear();
  const { era } = await inquirer.prompt([{
    type: 'rawlist',
    name: 'era',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#00FFCC').bold('3/3  Which release era should we search?'),
    choices: [
      { name: 'Any era', value: { yearFrom: 1950, yearTo: currentYear } },
      { name: `New releases (${currentYear - 5}–${currentYear})`, value: { yearFrom: currentYear - 5, yearTo: currentYear } },
      { name: '2010s', value: { yearFrom: 2010, yearTo: 2019 } },
      { name: '2000s', value: { yearFrom: 2000, yearTo: 2009 } },
      { name: '1990s', value: { yearFrom: 1990, yearTo: 1999 } },
      { name: '1980s', value: { yearFrom: 1980, yearTo: 1989 } },
      { name: 'Classic (1950–1979)', value: { yearFrom: 1950, yearTo: 1979 } },
    ],
  }]);

  return {
    keywordId,
    languages: languages.includes('any') ? ['any'] : languages.slice(0, 5),
    yearFrom: era.yearFrom,
    yearTo: era.yearTo,
  };
}

export async function printHelp() {
  const h   = (s) => chalk.hex('#FF9900').bold(s);
  const c   = (s) => chalk.hex('#FFCC00').bold(s);
  const d   = (s) => chalk.hex('#888888')(s);
  const dim = (s) => chalk.hex('#555555')(s);

  console.log('\n' + chalk.hex('#FF6600').bold('  ── CINEBLOCK HELP ──\n'));

  console.log(h('  MENU ACTIONS'));
  console.log(`  ${c('Update CLI token')}  ${d('Set or update your CineBlock terminal credential')}`);
  console.log(`  ${c('Update AI key')}     ${d('Set or update your AI API key (Gemini / OpenRouter / Groq)')}`);
  console.log(`  ${c('Help')}              ${d('Show this help screen')}\n`);

  console.log(h('  SEARCH MODES'));
  console.log(`  ${dim('›')} AI mode         ${d('Natural language; requires your own AI API key')}`);
  console.log(`  ${dim('›')} Guided mode     ${d('3 website-style questions; no AI key required')}`);
  console.log(`  ${dim('›')} CLI token       ${d('Only for terminal search access and the daily quota')}`);
  console.log(`  ${dim('›')} MCP token       ${d('Separate credential for ChatGPT library actions — never use it here')}\n`);

  console.log(h('  AI SEARCH EXAMPLES'));
  console.log(`  ${dim('›')} ${d('"dark psychological thriller"')}`);
  console.log(`  ${dim('›')} ${d('"movies like Interstellar but more hopeful"')}`);
  console.log(`  ${dim('›')} ${d('"90s action comedies"')}\n`);

  console.log(h('  AI PROVIDERS  (auto-detected from key prefix)'));
  console.log(`  ${c('Gemini')}       ${d('AIza...')}`);
  console.log(`  ${c('OpenRouter')}   ${d('sk-or-...')}`);
  console.log(`  ${c('Groq')}         ${d('gsk_...')}`);
  console.log(`  ${dim('Use /key to switch provider anytime.')}\n`);

  console.log(h('  AFTER RESULTS'));
  console.log(`  ${c('⚡ View More')}     Show next 5 results`);
  console.log(`  ${c('✨ New Search')}    Go back and search something new`);
  console.log(`  ${c('⟳ Reroll')}        Get different picks without repeating the current results`);
  console.log(`  ${c('🚪 Exit')}          Quit CineBlock\n`);

  console.log(dim('  Both modes return five poster-backed results verified against CineBlock metadata.\n'));

  // Pause so the screen isn't wiped by printHeader() on the next loop iteration
  await inquirer.prompt([{
    type: 'input',
    name: '_',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#444444')('  Press Enter to go back...'),
  }]);
}

export function printFooter(provider = 'gemini') {
  const left = chalk.hex('#333333')(`  ${provider}`);
  const right = chalk.hex('#333333')('cineblock-terminal v1.1');
  const cols = process.stdout.columns || 80;
  const gap = ' '.repeat(Math.max(2, cols - provider.length - 'cineblock-terminal v1.1'.length - 4));
  console.log('\n' + left + gap + right);
}

export async function promptControls(hasMore, mode = 'ai') {
  const choices = [];
  if (hasMore) {
    choices.push({ name: chalk.hex('#FFCC00').bold('⚡  View More Results'), value: 'more' });
  }
  choices.push({ name: chalk.hex('#FFFFFF').bold('✨  Quick New Search'), value: 'new_search' });
  choices.push({
    name: chalk.hex('#888888')(mode === 'ai' ? '⟳  Reroll AI Suggestions' : '⟳  Try another guided set'),
    value: 'reroll',
  });
  choices.push({ name: chalk.hex('#444444')('🚪  Exit CineBlock'), value: 'exit' });

  const { action } = await inquirer.prompt([{
    type: 'rawlist',
    name: 'action',
    prefix: '',
    theme: { prefix: '' },
    message: chalk.hex('#FFCC00').bold('SELECT ACTION:'),
    choices,
  }]);
  return action;
}
