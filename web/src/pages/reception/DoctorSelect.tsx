import type { RefObject } from 'react';
import type { StaffMember } from '../../types/api';

type Props = {
  doctors: StaffMember[];
  value: string;
  onChange: (id: string) => void;
  selectRef: RefObject<HTMLSelectElement | null>;
};

export function DoctorSelect({ doctors, value, onChange, selectRef }: Props) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Doctor
      </div>
      <select
        ref={selectRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field h-11 font-semibold"
      >
        <option value="">Select doctor…</option>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.fullName}
            {d.designation ? ` · ${d.designation}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
