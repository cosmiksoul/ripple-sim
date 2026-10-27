import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@ripple/schema';

describe('workspace', () => {
  it('resolves @ripple/schema from source', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
