import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/session';
import { ChiefDesignationForm } from '@/components/profile/chief-form';

export default async function ChiefPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, profile } = await requirePermission('designate_chiefs');
  const { id } = await params;
  if (!z.uuid().safeParse(id).success || id === profile.id) notFound();
  const [employee, grants, branches] = await Promise.all([
    db
      .from('profiles')
      .select('id,first_name,last_name,employee_id,role')
      .eq('id', id)
      .eq('active', true)
      .maybeSingle(),
    db.from('user_branches').select('branch_id').eq('user_id', id).order('branch_id').limit(101),
    db.from('branches').select('id,name').order('name').limit(101),
  ]);
  if (employee.error || grants.error || branches.error)
    throw new Error('No se pudo cargar la designación.');
  const user = employee.data;
  if (!user || (user.role !== 'OPERARIO' && user.role !== 'JEFE_ALMACEN')) notFound();
  if (grants.data.length > 100 || branches.data.length > 100)
    return (
      <p>
        El alcance supera el límite de 100 centros. Contacta con el responsable de configuración.
      </p>
    );
  const currentBranches = grants.data.map((g) => g.branch_id);
  return (
    <>
      <Link className="back-link" href="/admin/users">
        ← Usuarios
      </Link>
      <div className="page-heading">
        <div>
          <h1>
            {user.role === 'OPERARIO' ? 'Designar jefe de almacén' : 'Centros del jefe de almacén'}
          </h1>
          <p>
            {user.first_name} {user.last_name} · {user.employee_id}
          </p>
        </div>
      </div>
      <ChiefDesignationForm
        key={`${user.role}-${currentBranches.join(',')}`}
        userId={user.id}
        currentRole={user.role}
        currentBranches={currentBranches}
        branches={branches.data}
      />
    </>
  );
}
