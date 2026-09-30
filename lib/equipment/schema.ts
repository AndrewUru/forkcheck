export function isMissingFleetSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && ['PGRST205', 'PGRST202', '42703', '42P01', '42883'].includes(error.code ?? ''),
  );
}
