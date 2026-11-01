import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sharedPoint } from '../src/shared/shared-coordinates';

test('CSS coordinate mapping handles both letterbox directions without applying Retina twice', () => {
  assert.deepEqual(
    sharedPoint(
      510,
      420,
      { left: 10, top: 20, width: 1000, height: 800 },
      { width: 1200, height: 600 },
    ),
    { x: 600, y: 300, scale: 1000 / 1200 },
  );
  assert.deepEqual(
    sharedPoint(
      310,
      420,
      { left: 10, top: 20, width: 600, height: 800 },
      { width: 600, height: 1200 },
    ),
    { x: 300, y: 600, scale: 800 / 1200 },
  );
  assert.equal(
    sharedPoint(
      50,
      30,
      { left: 10, top: 20, width: 1000, height: 800 },
      { width: 1200, height: 600 },
    ),
    undefined,
  );
  assert.equal(
    sharedPoint(
      30,
      50,
      { left: 10, top: 20, width: 600, height: 800 },
      { width: 600, height: 1200 },
    ),
    undefined,
  );
  assert.equal(
    sharedPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }, { width: 600, height: 1200 }),
    undefined,
  );
});
