import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';

const files = (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
const migrations = await Promise.all(
  files.map(async (name) => `-- ${name}\n${await readFile(`supabase/migrations/${name}`, 'utf8')}`),
);
const seed = await readFile('supabase/seed.sql', 'utf8');
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/install-trial.sql',
  [
    '-- Forkcheck: instalación para una base NUEVA de prueba. No ejecutar sobre producción.',
    'begin;',
    "do $$ begin if to_regclass('public.organizations') is not null then raise exception 'Ya existe una instalación. No se ha modificado nada.'; end if; end $$;",
    ...migrations,
    '-- Datos de prueba persistidos en PostgreSQL',
    seed,
    "notify pgrst, 'reload schema';",
    'commit;',
  ].join('\n\n'),
  'utf8',
);
console.log(
  'Preparado artifacts/install-trial.sql. Ejecuta el archivo completo en SQL Editor del proyecto de prueba.',
);
