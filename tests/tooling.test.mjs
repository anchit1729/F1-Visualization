import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('root quality scripts are available', async () => {
  const packageJson = await readJson(
    new URL('../package.json', import.meta.url),
  );

  ['format:check', 'lint', 'test', 'typecheck'].forEach((script) => {
    assert.equal(typeof packageJson.scripts[script], 'string');
  });
});

test('tool versions and architecture decisions are recorded', async () => {
  const requiredFiles = [
    '../.nvmrc',
    '../.python-version',
    '../docs/style-guide.md',
    '../docs/decisions/0001-universal-expo.md',
    '../docs/decisions/0002-preprocessed-openf1.md',
  ];

  await Promise.all(
    requiredFiles.map((path) =>
      assert.doesNotReject(readFile(new URL(path, import.meta.url), 'utf8')),
    ),
  );
});

test('native development uses a project-owned Expo client', async () => {
  const app = await readJson(
    new URL('../apps/replay/app.json', import.meta.url),
  );
  const eas = await readJson(
    new URL('../apps/replay/eas.json', import.meta.url),
  );
  const packageJson = await readJson(
    new URL('../apps/replay/package.json', import.meta.url),
  );

  assert.equal(typeof packageJson.dependencies['expo-dev-client'], 'string');
  assert.match(packageJson.scripts.start, /--dev-client/u);
  assert.equal(typeof app.expo.ios.bundleIdentifier, 'string');
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build['development-simulator'].ios.simulator, true);
});
