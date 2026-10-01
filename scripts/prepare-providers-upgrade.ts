import { mkdir, readFile, writeFile } from 'node:fs/promises';
const sql = await readFile('supabase/migrations/202610010004_providers.sql', 'utf8');
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/update-providers.sql',
  [
    '-- Directorio de proveedores de renting. No incluye datos de prueba.',
    'begin;',
    "do $$ begin if to_regclass('public.organizations') is null then raise exception 'Instala primero la base de Forkcheck.'; end if; if to_regclass('public.providers') is not null then raise exception 'El directorio de proveedores ya esta instalado.'; end if; end $$;",
    sql,
    "notify pgrst, 'reload schema';",
    'commit;',
  ].join('\n\n'),
  'utf8',
);
console.log(
  'Preparado artifacts/update-providers.sql para ejecutar una vez en Supabase SQL Editor.',
);
