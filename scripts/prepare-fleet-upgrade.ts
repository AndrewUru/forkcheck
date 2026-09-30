import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
const names = (await readdir('supabase/migrations'))
  .filter((name) => name.startsWith('20261001') && name.endsWith('.sql'))
  .sort();
const files = await Promise.all(
  names.map(async (name) => `-- ${name}\n${await readFile(`supabase/migrations/${name}`, 'utf8')}`),
);
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/update-fleet.sql',
  [
    '-- Actualización incremental de Forkcheck: altas, bajas, asignaciones y nickname.',
    '-- No contiene seed, contraseñas ni borrado de datos existentes.',
    'begin;',
    "do $$ begin if to_regclass('public.equipment') is null then raise exception 'Instala primero la base de Forkcheck.'; end if; if to_regclass('public.equipment_operators') is not null then raise exception 'La actualización de flota ya está aplicada. No se han realizado cambios.'; end if; end $$;",
    ...files,
    "notify pgrst, 'reload schema';",
    'commit;',
  ].join('\n\n'),
  'utf8',
);
console.log(
  'Preparado artifacts/update-fleet.sql. Ejecutar una vez en el SQL Editor del proyecto existente.',
);
