#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const arg = require('arg');
const chalk = require('chalk');

const cwd = process.cwd();

const args = arg({
  '--help': Boolean,
  '--version': Boolean,
  '--example': String,
  '-h': '--help',
  '-v': '--version',
});

if (args['--version']) {
  const pkg = require(path.join(__dirname, 'package.json'));
  console.log(`create-viteron-app v${pkg.version}`);
  process.exit(0);
}

if (args['--help'] || (!args._[0])) {
  console.log(chalk`
    {bold.cyan create-viteron-app} - Create viteron (vite + electron) apps in one command ⚡

    {bold USAGE}

      {bold $} {cyan create-viteron-app} --help
      {bold $} {cyan create-viteron-app} {underline my-app}
      {bold $} {cyan create-viteron-app} {underline my-app} [--example {underline example_folder_name}]

    {bold OPTIONS}

      --help,     -h                      shows this help message
      --version,  -v                      displays the current version of create-viteron-app
      --example,  -e {underline example_folder_name}  sets the example as a template
  `);
  process.exit(0);
}

createViteronApp();

async function createViteronApp() {
  const spinner = require('./spinner');
  const example = args['--example'] || 'with-javascript';

  try {
    spinner.create('Validating existence...');
    await validateExistence(example);
  } catch (error) {
    spinner.fail(`Not found: ${example}`);
  }

  try {
    spinner.create('Downloading and extracting...');
    const name = path.join(cwd, args._[0]);
    await require('make-dir')(name);
    await downloadAndExtract(name, example, spinner);
  } catch (error) {
    spinner.fail(error);
  }
}

async function validateExistence(example) {
  const { Octokit } = require('@octokit/rest');
  await new Octokit().repos.getContent({
    owner: 'saltyshiomix',
    repo: 'viteron',
    path: `examples/${example}/package.json`,
  });
}

async function downloadAndExtract(name, example, spinner) {
  const mainUrl = 'https://codeload.github.com/saltyshiomix/viteron/tar.gz/main';
  const got = require('got');
  const { t, x } = require('tar');

  let ext = 'js';
  await got
    .stream(mainUrl)
    .pipe(t({ cwd: name, strip: 3, filter: (path) => {
      if (path.endsWith(`${example}/tsconfig.json`)) {
        ext = 'ts';
      }
      return false;
    }}))
    .on('finish', async () => {
      Promise.all([
        new Promise(resolve => {
          got
            .stream(mainUrl)
            .pipe(x({ cwd: name, strip: 3 }, ['viteron-main/examples/_template/gitignore.txt']))
            .on('finish', () => {
              fs.renameSync(path.join(name, 'gitignore.txt'), path.join(name, '.gitignore'));
              resolve();
            });
        }),
        new Promise(resolve => {
          got
            .stream(mainUrl)
            .pipe(x({ cwd: name, strip: 4 }, [`viteron-main/examples/_template/${ext}`]))
            .on('finish', () => resolve());
        }),
        new Promise(resolve => {
          got
            .stream(mainUrl)
            .pipe(x({ cwd: name, strip: 3 }, [`viteron-main/examples/${example}`]))
            .on('finish', () => resolve());
        }),
      ]).then(async () => {
        const cmd = (await pm() === 'yarn') ? 'yarn && yarn dev' : 'npm install && npm run dev';
        spinner.clear(`Run \`${cmd}\` inside of "${name}" to start the app`);
      }).catch(() => {
        spinner.fail('Unknown error occurred.');
      });
    });
}

async function pm() {
  const { promisify } = require('util');
  const { exec: defaultExec } = require('child_process');

  let pm = 'yarn';
  const exec = promisify(defaultExec);
  try {
    await exec(`${pm} -v`, { cwd });
  } catch (_) {
    pm = 'npm';
    try {
      await exec(`${pm} -v`, { cwd });
    } catch (_) {
      pm = undefined;
    }
  }

  if (pm === undefined) {
    console.log(chalk.red('No available package manager! (`npm` or `yarn` is required)'));
    process.exit(1);
  }

  return pm;
}
