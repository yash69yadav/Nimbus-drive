import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('project has a runnable local server and application entry point', async () => {
  const [html, app, collections, server] = await Promise.all([
    readFile('index.html', 'utf8'), readFile('app.js', 'utf8'), readFile('mongodb/collections.js', 'utf8'), readFile('server.js', 'utf8')
  ]);
  assert.match(html, /id="content-grid"/);
  assert.match(html, /id="share-modal"/);
  assert.match(app, /async function uploadFiles/);
  assert.match(app, /function showShareModal/);
  assert.match(app, /function trashItem/);
  assert.match(collections, /createIndex/);
  assert.match(collections, /linkShares/);
  assert.match(server, /GridFSBucket/);
});
