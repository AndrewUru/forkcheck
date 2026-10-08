import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { session } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { InspectionForm } from '@/components/inspections/form';
import { InspectionResult } from '@/components/inspections/result';
import type { AnswerKind } from '@/types/domain';
const answerLabels: Record<AnswerKind, string> = {
  OK: 'Correcto',
  WARNING: 'Con incidencias',
  CRITICAL: 'Crítico',
  NOT_APPLICABLE: 'No aplica',
};
function answerLabel(value: string) {
  switch (value) {
    case 'OK':
    case 'WARNING':
    case 'CRITICAL':
    case 'NOT_APPLICABLE':
      return answerLabels[value];
    default:
      return 'Respuesta no reconocida';
  }
}
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
      .order('sort_order')
      .limit(501),
    db
      .from('checklist_sections')
      .select('*')
      .eq('version_id', i.checklist_version_id)
      .order('sort_order')
      .limit(101),
    db.from('checklist_versions').select('*').eq('id', i.checklist_version_id).single(),
    db.from('equipment').select('*').eq('id', i.equipment_id).maybeSingle(),
  ]);
  if (items.error || sections.error || version.error || equipment.error)
    throw new Error('No se puede cargar la inspección');
  if (items.data.length > 500 || sections.data.length > 100)
    throw new Error('La versión supera el límite de visualización. Contacta con el administrador.');
  let content;
  if (i.completed_at) {
    const [answers, signature, incidents, organization] = await Promise.all([
      db.from('inspection_answers').select('*').eq('inspection_id', i.id).limit(501),
      db.from('signatures').select('*').eq('inspection_id', i.id).single(),
      db.from('incidents').select('id').eq('inspection_id', i.id).limit(501),
      db.from('organizations').select('timezone').single(),
    ]);
    if (answers.error || signature.error || incidents.error || organization.error)
      throw new Error('No se puede cargar el resultado');
    const evidence: { id: string; url: string }[] = [];
    if (incidents.data.length) {
      const { data: attachments, error: attachmentError } = await db
        .from('incident_attachments')
        .select('*')
        .in(
          'incident_id',
          incidents.data.map((incident) => incident.id),
        );
      if (attachmentError) throw attachmentError;
      const results = await Promise.all(
        attachments.map(async (attachment) => {
          const { data, error } = await db.storage
            .from('inspection-evidence')
            .createSignedUrl(attachment.storage_path, 300);
          if (error) throw error;
          return { id: attachment.id, url: data.signedUrl };
        }),
      );
      evidence.push(...results);
    }
    const { data: signed, error: signatureError } = await db.storage
      .from('inspection-evidence')
      .createSignedUrl(signature.data.storage_path, 60);
    if (signatureError) throw signatureError;
    content = (
      <>
        <InspectionResult
          equipment={equipment.data}
          outcome={i.overall_status ? answerLabels[i.overall_status] : 'Registrado'}
          completed={new Date(i.completed_at).toLocaleString('es-ES', {
            timeZone: organization.data.timezone,
          })}
          incidents={incidents.data.length}
        />
        <section className="panel detail-panel">
          {items.data.map((item) => {
            const a = answers.data.find((a) => a.checklist_item_id === item.id);
            return (
              <div key={item.id} className="history-row">
                <div>
                  <strong>{item.label}</strong>
                  {a?.notes && <p>{a.notes}</p>}
                </div>
                <span>{a ? answerLabel(a.answer) : 'Opcional sin respuesta'}</span>
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
          {evidence.length > 0 && (
            <>
              <h2>Fotografías de las incidencias</h2>
              <div className="evidence-grid">
                {evidence.map((photo, index) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                    <Image
                      src={photo.url}
                      alt={`Evidencia de incidencia ${index + 1}`}
                      width={240}
                      height={180}
                      unoptimized
                    />
                  </a>
                ))}
              </div>
            </>
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
  else {
    const prefix = `${profile.organization_id}/${i.id}`;
    const { data: objects, error: listError } = await db.storage
      .from('inspection-evidence')
      .list(prefix, { search: 'signature.png' });
    if (listError) throw listError;
    let existingSignature: string | undefined;
    if (objects?.some((object) => object.name === 'signature.png')) {
      const { data, error } = await db.storage
        .from('inspection-evidence')
        .createSignedUrl(`${prefix}/signature.png`, 300);
      if (error) throw error;
      existingSignature = data.signedUrl;
    }
    content = (
      <InspectionForm
        inspectionId={i.id}
        items={items.data}
        sections={sections.data}
        existingSignature={existingSignature}
      />
    );
  }
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
