import { it } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from './limits.js';

it('bounds bursts and refills over time without an identifier map', () => {
  let time = 0;
  const bucket = new TokenBucket(2, 60, () => time);
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);
  time = 999;
  assert.equal(bucket.take(), false);
  time = 1000;
  assert.equal(bucket.take(), true);
  time = 100_000;
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);
});
