import { describe, expect, it } from 'vitest';
import base from '../tsconfig/base.json';
import { integrationTestConfig, unitTestConfig } from '../vitest.js';

describe('@penka/config presets', () => {
  it('enforces TypeScript strict mode in the shared base tsconfig', () => {
    expect(base.compilerOptions.strict).toBe(true);
  });

  it('separates unit and integration test globs', () => {
    expect(unitTestConfig.test.include).toContain('src/**/*.test.ts');
    expect(integrationTestConfig.test.include).toContain('test/**/*.int.test.ts');
  });
});
