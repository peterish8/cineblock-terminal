// Everything that asks the user something. Loaded only when stdin and stdout
// are terminals, so scripts and agents never pay for @inquirer/prompts.
import { checkbox, input, password, select } from '@inquirer/prompts';
import { toCliError } from './errors.js';
import { validateCliToken } from './credentials.js';
import { eraPresets, LANGUAGES, MAX_LANGUAGES, MIN_YEAR, QUESTIONS, STORY_SIGNALS } from './guided.js';
import { formatError, formatMovies, formatQuota } from './render.js';
import { MAIN_HELP } from './help.js';
import { PROVIDERS } from './ai.js';
import * as commands from './commands.js';

export function createUi(app) {
  const s = app.style;
  const theme = {
    prefix: { idle: s.primary('?'), done: s.success('✔') },
    style: { highlight: (t) => s.primary(t), answer: (t) => s.accent(t), description: (t) => s.muted(t), help: (t) => s.muted(t) },
  };
  const say = (text = '') => app.out(text);
  // app.promptContext lets tests drive the prompts with fake input/output streams.
  const ask = (prompt, config) => prompt(config, app.promptContext);

  async function askGuidedFilters() {
    say(`\n${s.bold(`1/3  ${QUESTIONS.signal.title}`)}\n${s.muted(QUESTIONS.signal.help)}`);
    const keywordId = await ask(select, {
      message: 'Story signal',
      theme,
      pageSize: 12,
      default: null,
      choices: [{ name: 'Any story signal', value: null }, ...STORY_SIGNALS.map((x) => ({ name: x.label, value: x.id }))],
    });

    say(`\n${s.bold(`2/3  ${QUESTIONS.language.title}`)}\n${s.muted(`${QUESTIONS.language.help} Pick up to ${MAX_LANGUAGES}.`)}`);
    const picked = await ask(checkbox, {
      message: 'Languages',
      theme,
      pageSize: 12,
      choices: LANGUAGES.map((l) => ({ name: l.native && l.native !== l.name ? `${l.name} (${l.native})` : l.name, value: l.code, checked: l.code === 'any' })),
      validate: (values) => {
        const specific = values.map((v) => v.value ?? v).filter((v) => v !== 'any');
        return specific.length <= MAX_LANGUAGES || `Pick up to ${MAX_LANGUAGES} languages, or Any language.`;
      },
    });
    const specific = picked.filter((code) => code !== 'any');
    const languages = specific.length ? specific : ['any'];

    say(`\n${s.bold(`3/3  ${QUESTIONS.era.title}`)}\n${s.muted(QUESTIONS.era.help)}`);
    const now = new Date(app.now());
    const presets = eraPresets(now);
    const era = await ask(select, {
      message: 'Release years',
      theme,
      pageSize: 10,
      default: 'recent',
      choices: [...presets.map((p) => ({ name: p.label, value: p.name })), { name: 'Pick exact years', value: 'custom' }],
    });
    if (era !== 'custom') {
      const preset = presets.find((p) => p.name === era);
      return { keywordId, languages, yearFrom: preset.yearFrom, yearTo: preset.yearTo };
    }
    const maxYear = now.getUTCFullYear();
    const yearCheck = (min) => (value) => {
      const year = Number(value);
      return (Number.isInteger(year) && year >= min && year <= maxYear) || `Enter a year from ${min} to ${maxYear}.`;
    };
    const yearFrom = Number(await ask(input, { message: 'From year', theme, default: String(maxYear - 15), validate: yearCheck(MIN_YEAR) }));
    const yearTo = Number(await ask(input, { message: 'To year', theme, default: String(maxYear), validate: yearCheck(yearFrom) }));
    return { keywordId, languages, yearFrom, yearTo };
  }

  async function askAiQuery() {
    say(s.muted('\nDescribe a mood, a premise, or "like X but Y". Your AI suggests, CineBlock checks the titles.'));
    const text = await ask(input, {
      message: 'What do you feel like watching?',
      theme,
      validate: (v) => (v.trim().length > 0 && v.trim().length <= 500) || 'Write a few words, up to 500 characters.',
    });
    return text.trim();
  }

  async function askToken() {
    say(`\n${s.bold('Sign in to CineBlock Terminal')}`);
    say(s.muted(`1. Sign in at ${app.baseUrl} and open Profile.`));
    say(s.muted('2. Under CineBlock Terminal, generate or copy your token. It starts with cb_.'));
    say(s.muted('   Not your mcp_ token: that one is only for ChatGPT and Claude connectors.\n'));
    return ask(password, {
      message: 'Paste your CLI token',
      mask: '*',
      theme,
      validate: (value) => {
        try {
          validateCliToken(value);
          return true;
        } catch (err) {
          return `${err.message} ${err.hint ?? ''}`.trim();
        }
      },
    });
  }

  async function askAndSaveAiKey() {
    say(`\n${s.bold('Add your AI key')}`);
    say(s.muted('AI search uses your own key. It stays on this computer and goes only to your provider.'));
    say(s.muted('Gemini: aistudio.google.com/apikey  ·  Groq: console.groq.com/keys  ·  OpenRouter: openrouter.ai/keys\n'));
    const key = await ask(password, {
      message: 'Paste your Gemini, Groq or OpenRouter key',
      mask: '*',
      theme,
      validate: (value) => {
        try {
          return Boolean(commands.checkAiKey(value));
        } catch (err) {
          return err.hint ?? err.message;
        }
      },
    });
    const { provider } = await commands.saveAiKey(app, key);
    say(`${s.success('✔')} ${PROVIDERS[provider].label} key saved.`);
  }

  /** Show results and let the user reroll or open titles until they're done. */
  async function browse(search, command) {
    let page;
    const fetchPage = async (text) => {
      const stop = app.spinner(text);
      try {
        page = await search.next();
      } finally {
        stop();
      }
    };
    await fetchPage(command === 'ai' ? 'Asking your AI and checking titles on CineBlock...' : 'Finding five picks...');

    for (;;) {
      if (page.movies.length === 0) {
        say(`\n${s.muted(command === 'ai' ? 'No new matches this time. Try describing it another way.' : 'No more matches for these answers. Try Any language or a wider era.')}`);
      } else {
        say(`\n${formatMovies(page.movies, s, { columns: app.columns })}\n`);
      }
      if (search.quota) say(formatQuota(search.quota, s, app.now()));

      const choices = [];
      if (page.movies.length) choices.push({ name: 'Show five different picks', value: 'more', description: 'Free. Same search, nothing repeated.' });
      if (page.movies.length) choices.push({ name: 'Open one on cineblock.in', value: 'open' });
      choices.push({ name: 'Done', value: 'done' });
      const action = await ask(select, { message: 'What next?', theme, choices });

      if (action === 'more') {
        await fetchPage('Finding different picks...');
      } else if (action === 'open') {
        const movie = await ask(select, { message: 'Which one?', theme, choices: page.movies.map((m) => ({ name: `${m.title}${m.year ? ` (${m.year})` : ''}`, value: m })) });
        await commands.open(app, {}, [String(movie.tmdbId)]);
      } else {
        return;
      }
    }
  }

  async function header() {
    say(`\n${s.accent('▌')} ${s.bold('CineBlock Terminal')} ${s.muted(app.version)}`);
    const saved = await app.store.getToken();
    if (!saved) return null;
    try {
      const account = await (await app.api()).account();
      say(`${s.muted('  Signed in as')} ${account.name}${s.muted('  ·  ')}${formatQuota(account.quota, s, app.now())}`);
      return account;
    } catch (err) {
      const e = toCliError(err);
      say(formatError(e, s));
      return e.code === 'AUTH_INVALID' ? null : { name: null };
    }
  }

  async function menu() {
    if (!(await header())) await commands.login(app, {});
    for (;;) {
      say('');
      const choice = await ask(select, {
        message: 'What would you like to do?',
        theme,
        pageSize: 10,
        choices: [
          { name: 'Guided search', value: 'guided', description: 'Three quick questions, five picks. No AI key needed.' },
          { name: 'AI search', value: 'ai', description: 'Describe it in your own words. Uses your own AI key.' },
          { name: 'My lists', value: 'list', description: 'Watchlist, liked and watched. Free.' },
          { name: 'Account and searches left', value: 'status' },
          { name: 'AI key', value: 'ai-key', description: 'Add or change your Gemini, Groq or OpenRouter key.' },
          { name: 'Use a different CLI token', value: 'login' },
          { name: 'Help', value: 'help' },
          { name: 'Quit', value: 'quit' },
        ],
      });
      if (choice === 'quit') return;
      try {
        if (choice === 'guided') {
          await commands.guided(app, {});
        } else if (choice === 'ai') {
          await commands.ai(app, {}, []);
        } else if (choice === 'list') {
          const name = await ask(select, { message: 'Which list?', theme, choices: [{ name: 'Watchlist', value: 'watchlist' }, { name: 'Liked', value: 'liked' }, { name: 'Watched', value: 'watched' }] });
          await commands.list(app, {}, [name]);
        } else if (choice === 'status') {
          await commands.status(app);
        } else if (choice === 'ai-key') {
          await askAndSaveAiKey();
        } else if (choice === 'login') {
          await commands.login(app, {});
        } else if (choice === 'help') {
          say(MAIN_HELP);
        }
      } catch (err) {
        const e = toCliError(err);
        if (e.code === 'INTERRUPTED') throw e;
        say(`\n${formatError(e, s)}`);
      }
    }
  }

  return { askGuidedFilters, askAiQuery, askToken, askAndSaveAiKey, browse, menu };
}
