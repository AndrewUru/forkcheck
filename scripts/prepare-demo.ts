import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
await copyFile('supabase/demo-testers.sql', 'artifacts/setup-demo.sql');
console.log('Preparado artifacts/setup-demo.sql. Aplicar solo al proyecto de demostración.');
