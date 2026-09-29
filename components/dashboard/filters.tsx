import Link from 'next/link';
import type { Filters } from '@/lib/validations/filters';
type Option = { id: string; name: string };
export function FilterBar({
  filters,
  regions,
  branches,
  zones,
  types,
}: {
  filters: Filters;
  regions: Option[];
  branches: Option[];
  zones: Option[];
  types: Option[];
}) {
  return (
    <form className="filter-bar">
      <label>
        Fecha
        <input type="date" name="date" defaultValue={filters.date} />
      </label>
      {(
        [
          { name: 'region', label: 'Región', options: regions },
          { name: 'branch', label: 'Sucursal', options: branches },
          { name: 'zone', label: 'Zona', options: zones },
          { name: 'type', label: 'Tipo de equipo', options: types },
        ] as const
      ).map(({ name, label, options }) => (
        <label key={name}>
          {label}
          <select name={name} defaultValue={filters[name] ?? ''}>
            <option value="">Todas</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Marca
        <input name="brand" placeholder="Todas" defaultValue={filters.brand} />
      </label>
      <label>
        Modelo
        <input name="model" placeholder="Todos" defaultValue={filters.model} />
      </label>
      <button className="button dark">Aplicar</button>
      <Link className="text-link" href="/admin">
        Limpiar
      </Link>
    </form>
  );
}
