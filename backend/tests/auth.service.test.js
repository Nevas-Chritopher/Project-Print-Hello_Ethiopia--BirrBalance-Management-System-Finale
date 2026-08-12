import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePassword, hashPassword } from '../src/services/auth.service.js';
import { departmentNamesMatch, normalizeDepartmentName } from '../src/services/company.service.js';

test('comparePassword accepts legacy plain-text passwords', async () => {
  const legacyPassword = 'Password123';
  assert.equal(await comparePassword(legacyPassword, legacyPassword), true);
  assert.equal(await comparePassword('WrongPassword', legacyPassword), false);
});

test('comparePassword verifies bcrypt hashes', async () => {
  const hashedPassword = await hashPassword('Password123');
  assert.equal(await comparePassword('Password123', hashedPassword), true);
  assert.equal(await comparePassword('WrongPassword', hashedPassword), false);
});

test('department names must be treated as distinct even when one is a prefix of the other', () => {
  assert.equal(normalizeDepartmentName('Finance'), 'finance');
  assert.equal(normalizeDepartmentName('Finance Office'), 'financeoffice');
  assert.equal(normalizeDepartmentName('Law'), 'law');
  assert.equal(normalizeDepartmentName('Law Enforcement'), 'lawenforcement');

  assert.equal(departmentNamesMatch('Finance', 'Finance Office'), false);
  assert.equal(departmentNamesMatch('Law', 'Law Enforcement'), false);
  assert.equal(departmentNamesMatch('Finance Office', 'Finance Office'), true);
});
