import { CATEGORIES, CATEGORY_LABEL } from '../../lib/categories';
import type { PatientCategory } from '../../types/api';

type Props = {
  value: PatientCategory;
  onChange: (c: PatientCategory) => void;
};

export function CategoryControl({ value, onChange }: Props) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Category
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {CATEGORIES.map((c) => {
          const selected = c === value;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={[
                'h-11 rounded-lg border text-sm font-semibold uppercase',
                selected
                  ? 'border-amber-500 bg-amber-400 text-neutral-950'
                  : 'border-line bg-white text-slate-700 hover:border-slate-300',
              ].join(' ')}
            >
              {CATEGORY_LABEL[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
