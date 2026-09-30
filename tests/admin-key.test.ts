import { describe, expect, it } from 'vitest';
import { assertAdminKey } from '../scripts/admin-key';
const jwt = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
describe('administrative credential preflight', () => {
  it('rejects anon credentials accidentally placed in service-role variable', () =>
    expect(() => assertAdminKey(jwt('anon'))).toThrow('no es administrativa'));
  it('rejects public, missing and malformed keys without disclosing values', () => {
    for (const key of ['sb_publishable_example', 'invalid', undefined])
      expect(() => assertAdminKey(key)).toThrow();
  });
  it('accepts administrative key formats (the remote service still verifies the credential)', () => {
    expect(() => assertAdminKey(jwt('service_role'))).not.toThrow();
    expect(() => assertAdminKey('sb_secret_example')).not.toThrow();
  });
});
