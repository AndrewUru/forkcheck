import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
export async function createFleetTestDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema auth; create schema storage; create schema extensions;
 create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create table auth.users(id uuid primary key,aud text,role text,email text,encrypted_password text,raw_app_meta_data jsonb default '{}'::jsonb,created_at timestamptz,updated_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage,extensions to authenticated; grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  return db;
}
