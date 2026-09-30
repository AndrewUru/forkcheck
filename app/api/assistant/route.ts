import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAssistant } from '@/lib/ai/agent';

export const runtime = 'nodejs';
const requestSchema = z
  .object({
    question: z.string().trim().min(3).max(600),
    publicCode: z
      .string()
      .regex(/^[a-zA-Z0-9-]{4,80}$/)
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host'))
    return Response.json({ error: 'Origen no autorizado.' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 1500)
    return Response.json({ error: 'Consulta demasiado larga.' }, { status: 413 });
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: 'Consulta inválida.' }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY)
    return Response.json({ error: 'La IA aún no está configurada.' }, { status: 503 });
  const db = await createClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user)
    return Response.json({ error: 'Inicia sesión de nuevo.' }, { status: 401 });
  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .eq('active', true)
    .single();
  if (!profile) return Response.json({ error: 'Usuario no autorizado.' }, { status: 403 });
  try {
    const assistant = createAssistant({ db, profile });
    const prompt = input.publicCode
      ? `Equipo en pantalla: ${input.publicCode}. Pregunta: ${input.question}`
      : input.question;
    const result = await assistant.generate({ prompt });
    if (!result.text.trim()) throw new Error('Empty response');
    return Response.json({ answer: result.text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { error: 'No se pudo completar la consulta. Inténtalo de nuevo.' },
      { status: 502 },
    );
  }
}
