export const MAX_EXPIRED_BALANCE_RESTORATION_ETB = 860;

export const capRestorationCandidate = (
  candidate,
  restoredByEmployee = new Map(),
  limit = MAX_EXPIRED_BALANCE_RESTORATION_ETB,
) => {
  const key = String(candidate.employee_key ?? candidate.employee_id);
  const limitCents = Math.max(0, Math.round(Number(limit) * 100));
  const restoredCents = Math.max(0, Math.round(Number(restoredByEmployee.get(key) ?? 0) * 100));
  const candidateCents = Math.max(0, Math.round(Number(candidate.amount) * 100));
  const amountCents = Math.min(candidateCents, Math.max(0, limitCents - restoredCents));

  restoredByEmployee.set(key, (restoredCents + amountCents) / 100);
  if (amountCents === 0) return null;

  return { ...candidate, amount: amountCents / 100 };
};