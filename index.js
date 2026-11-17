#!/usr/bin/env node
import {
  printHeader,
  printError,
  printInfo,
  printHelp,
  promptSearchMode,
  promptNaturalLanguage,
  promptGuidedSearch,
  promptControls,
  promptApiKey,
  promptCliToken,
} from './lib/ui.js';
import { getVerifiedMovie } from './lib/ai.js';
import { searchMovie, findGuidedMovies } from './lib/tmdb.js';
import { renderPage } from './lib/display.js';
import { getApiKey, setApiKey, getCliToken, setCliToken } from './lib/config.js';
import { pingToken, validateSearch, DAILY_LIMIT } from './lib/cineblock.js';
import ora from 'ora';
import chalk from 'chalk';

async function verifyAndSaveCliToken(currentToken) {
  const token = currentToken || await promptCliToken();
  const spinner = ora(chalk.hex('#FFCC00')('Verifying CLI token with CineBlock...')).start();
  const ping = await pingToken(token);
  spinner.stop();

  if (!ping.ok) {
    if (ping.error === 'Invalid token' || ping.error === 'Invalid token format') {
      printError('CLI token not recognised. Go to cineblock.in/profile and copy the CLI token, not the MCP token.');
    } else {
      printError(`Could not reach CineBlock: ${ping.error}. Check your internet connection.`);
    }
    return null;
  }

  setCliToken(token);
  printInfo(`Welcome, ${ping.name}! CLI token verified. ${ping.searchesRemaining} searches remaining today.\n`);
  return token;
}

async function startApp() {
  printHeader();
  let cliToken = await verifyAndSaveCliToken(getCliToken());
  if (!cliToken) process.exit(1);

  // AI is optional. Guided mode uses the website's no-AI filter endpoint.
  let apiKey = getApiKey();

  while (true) {
    printHeader();
    const mode = await promptSearchMode();

    if (mode === 'exit') process.exit(0);
    if (mode === 'help') {
      await printHelp();
      continue;
    }
    if (mode === 'login') {
      const nextToken = await verifyAndSaveCliToken();
      if (nextToken) cliToken = nextToken;
      continue;
    }
    if (mode === 'key') {
      apiKey = await promptApiKey();
      setApiKey(apiKey);
      printInfo('AI API key updated. Guided no-AI search never needs this key.\n');
      continue;
    }

    let query = '';
    let guidedState = null;
    if (mode === 'ai') {
      if (!apiKey) {
        apiKey = await promptApiKey();
        setApiKey(apiKey);
        printInfo('AI API key saved. Guided no-AI search never needs this key.\n');
      }
      query = await promptNaturalLanguage();
    } else {
      guidedState = await promptGuidedSearch();
    }

    // The CLI token is only for terminal search access and the daily quota.
    const authResult = await validateSearch(cliToken);
    if (!authResult.ok) {
      if (authResult.error === 'Invalid token') {
        printError('Your CLI token is invalid. Choose Update CLI token and paste the cb_ token from CineBlock Profile.');
      } else if (authResult.error === 'Daily limit reached') {
        printError(`Daily limit reached — you've used all ${DAILY_LIMIT} searches for today. Resets at midnight UTC.`);
      } else {
        printError('Could not verify with CineBlock. Check your connection.');
      }
      continue;
    }
    console.log(chalk.hex('#333333')(`  searches today: ${authResult.searchesUsed}/${DAILY_LIMIT}  ·  ${authResult.searchesRemaining} remaining\n`));

    const seenTitles = new Set();
    const seenIds = new Set();

    async function fetchResults(excluded = []) {
      if (mode === 'guided') {
        const spinner = ora(chalk.hex('#00FFCC')('CineBlock is matching your three filters...')).start();
        let guidedMovies;
        try {
          guidedMovies = await findGuidedMovies({ ...guidedState, excludeIds: excluded });
        } catch {
          spinner.stop();
          printError('Guided search could not reach CineBlock. Check your connection and try again.');
          return null;
        }
        spinner.stop();
        if (!guidedMovies.length) {
          printError('No guided matches found. Try Any language or a wider era.');
          return null;
        }
        return guidedMovies;
      }

      const spinner = ora(chalk.hex('#FFCC00')('CineBlock AI is curating your selection...')).start();
      let recs = [];
      try {
        recs = await getVerifiedMovie(query, apiKey, excluded);
        spinner.stop();
      } catch {
        spinner.stop();
        printError('AI curate failed. Check your AI API key or connection.');
        return null;
      }
      if (!recs.length) {
        printError('No matches found — try something more specific.');
        return null;
      }

      const verifySpinner = ora(chalk.hex('#00FFCC')('Contacting CineBlock.in for metadata...')).start();
      const verified = [];
      for (const rec of recs) {
        if (excluded.includes(rec.title)) continue;
        const match = await searchMovie(rec.title, rec.release_year ?? rec.year);
        if (match) {
          const aiGenres = Array.isArray(rec.genres) ? rec.genres : [];
          const combinedGenres = [...new Set([...(match.genres || []), ...aiGenres])];
          verified.push({ ...match, reason: rec.reason, genres: combinedGenres });
        }
      }
      verifySpinner.stop();
      if (verified.length === 0) {
        printError('No verified results found on CineBlock servers.');
        return null;
      }
      return verified.slice(0, 15);
    }

    let verifiedMovies = await fetchResults([]);
    if (!verifiedMovies) continue;
    verifiedMovies.forEach((movie) => {
      seenTitles.add(movie.title);
      seenIds.add(movie.tmdb_id);
    });

    let page = 0;
    let exitToSearch = false;
    while (!exitToSearch) {
      const slice = verifiedMovies.slice(page * 5, page * 5 + 5);
      await renderPage(slice);

      const hasMore = (page + 1) * 5 < verifiedMovies.length;
      const action = await promptControls(hasMore, mode);

      if (action === 'more') {
        page++;
      } else if (action === 'new_search') {
        exitToSearch = true;
      } else if (action === 'reroll') {
        const excluded = mode === 'ai' ? [...seenTitles] : [...seenIds];
        const fresh = await fetchResults(excluded);
        if (fresh) {
          fresh.forEach((movie) => {
            seenTitles.add(movie.title);
            seenIds.add(movie.tmdb_id);
          });
          verifiedMovies = fresh;
          page = 0;
        }
      } else if (action === 'exit') {
        process.exit(0);
      }
    }
  }
}

startApp().catch((err) => {
  console.error(chalk.red('\nFATAL ERROR:'), err.message);
  process.exit(1);
});
