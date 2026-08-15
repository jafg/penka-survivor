import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { StrictObject } from './strict';

describe('StrictObject', () => {
  it('rejects extra fields', () => {
    const schema = StrictObject({ a: Type.String() });
    expect(Value.Check(schema, { a: 'x' })).toBe(true);
    expect(Value.Check(schema, { a: 'x', b: 1 })).toBe(false);
  });

  it('stays closed even when caller options try to reopen it', () => {
    const schema = StrictObject({ a: Type.String() }, { additionalProperties: true });
    expect(schema.additionalProperties).toBe(false);
    expect(Value.Check(schema, { a: 'x', b: 1 })).toBe(false);
  });

  it('still passes other options through', () => {
    const schema = StrictObject({ a: Type.String() }, { description: 'demo' });
    expect(schema.description).toBe('demo');
    expect(schema.additionalProperties).toBe(false);
  });
});
