import { it, expect } from 'vitest';
import { passwordChange, passwordReset } from '@/lib/validations/password';

it('requires matching, distinct passwords of the supported length', () => {
  const valid = {
    current_password: 'old-password',
    password: 'new-password-long',
    confirmation: 'new-password-long',
  };
  expect(passwordChange.safeParse(valid).success).toBe(true);
  expect(passwordChange.safeParse({ ...valid, confirmation: 'different-password' }).success).toBe(
    false,
  );
  expect(passwordChange.safeParse({ ...valid, current_password: valid.password }).success).toBe(
    false,
  );
  expect(
    passwordChange.safeParse({ ...valid, password: 'short', confirmation: 'short' }).success,
  ).toBe(false);
  expect(
    passwordChange.safeParse({ ...valid, password: 'x'.repeat(129), confirmation: 'x'.repeat(129) })
      .success,
  ).toBe(false);
});
it('requires explicit reset confirmation and a valid target', () => {
  expect(passwordReset.safeParse({ user_id: crypto.randomUUID(), confirm: 'yes' }).success).toBe(
    true,
  );
  expect(passwordReset.safeParse({ user_id: crypto.randomUUID() }).success).toBe(false);
  expect(passwordReset.safeParse({ user_id: 'invalid', confirm: 'yes' }).success).toBe(false);
});
