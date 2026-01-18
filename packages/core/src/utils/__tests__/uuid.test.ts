import { describe, it, expect } from 'vitest';

import { generateUUID } from '../uuid';

describe('generateUUID', () => {
  it('should generate a valid UUID v4 format', () => {
    const uuid = generateUUID();
    const uuidRegex = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      uuids.add(generateUUID());
    }
    expect(uuids.size).toBe(1000);
  });

  it('should have correct length', () => {
    const uuid = generateUUID();
    expect(uuid.length).toBe(36);
  });

  it('should have version 4 indicator', () => {
    const uuid = generateUUID();
    expect(uuid[14]).toBe('4');
  });

  it('should have correct variant', () => {
    const uuid = generateUUID();
    const variantChar = uuid[19];
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });
});
