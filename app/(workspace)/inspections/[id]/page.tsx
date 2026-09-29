import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { InspectionForm } from '@/components/inspections/form';
export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db, profile } = await session();
  const { data: i, error } = await db.from('inspections').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!i) notFound();
  const [items, sections, version, equipment] = await Promise.all([
    db
      .from('checklist_items')
      .select('*')
      .eq('version_id', i.checklist_version_id)
      .order('sort_order'),
    db
      .from('checklist_sections')
      .select('*')
      .eq('version_id', i.checklist_version_id)
      .order('sort_order'),
    db.from('checklist_versions').select('*').eq('id', i.checklist_version_id).single(),
    db.from('equipment').select('*').eq('id', i.equipment_id).maybeSingle(),
  ]);
  if (items.error || sections.error || version.error || equipment.error)
    throw new Error('No se puede cargar la inspección');
  let content;
  if (i.completed_at) {
    const [answers, signature] = await Promise.all([
      db.from('inspection_answers').select('*').eq('inspection_id', i.id),
      db.from('signatures').select('*').eq('inspection_id', i.id).single(),
    ]);
    if (answers.error || signature.error) throw new Error('No se puede cargar el resultado');
    const { data: signed, error: signatureError } = await db.storage
      .from('inspection-evidence')
      .createSignedUrl(signature.data.storage_path, 60);
    if (signatureError) throw signatureError;
    content = (
      <>
        <div className="success-banner">
          <h2>Inspección registrada</h2>
          <p>
            Resultado: {i.overall_status} · {new Date(i.completed_at).toLocaleString('es-ES')}
          </p>
        </div>
        <section className="panel detail-panel">
          {items.data.map((item) => {
            const a = answers.data.find((a) => a.checklist_item_id === item.id);
            return (
              <div key={item.id} className="history-row">
                <div>
                  <strong>{item.label}</strong>
                  {a?.notes && <p>{a.notes}</p>}
                </div>
                <span>{a?.answer ?? 'Opcional sin respuesta'}</span>
              </div>
            );
          })}
          <h2>Confirmación interna</h2>
          {signed && (
            <Image
              src={signed.signedUrl}
              alt="Firma de confirmación del operario"
              width={400}
              height={140}
              unoptimized
            />
          )}
        </section>
      </>
    );
  } else if (i.user_id !== profile.id || !can(profile, 'inspect'))
    content = (
      <div className="info-note">
        Esta inspección está en curso. Solo el operario que la inició puede completarla.
      </div>
    );
  else content = <InspectionForm inspectionId={i.id} items={items.data} sections={sections.data} />;
  return (
    <div className="inspection-page">
      {equipment.data && (
        <Link className="back-link" href={`/equipment/${equipment.data.public_code}`}>
          ← Volver al equipo
        </Link>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">REVISIÓN DE SEGURIDAD · VERSIÓN {version.data.version}</p>
          <h1>{equipment.data?.internal_code ?? 'Inspección histórica'}</h1>
          <p>La seguridad empieza con una revisión completa.</p>
        </div>
      </div>
      {content}
    </div>
  );
}
