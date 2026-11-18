import { memo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Card } from '../../../components/Card';
import type { Criterion } from '../../../lib/types';

interface CriterionControlProps {
  criterion: Criterion;
  value: number | undefined;
  enabled: boolean;
  showRequired: boolean;
  onChange: (criterionId: number, value: number) => void;
}

const stepButton =
  'min-h-11 min-w-11 inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 disabled:opacity-35 disabled:pointer-events-none';

/** One lightweight score control. Memoization keeps untouched criteria from
 * re-rendering while a member moves another criterion's slider. */
export const CriterionControl = memo(function CriterionControl({
  criterion,
  value,
  enabled,
  showRequired,
  onChange,
}: CriterionControlProps) {
  const sliderValue = value ?? 0;

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{criterion.name}</h2>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Decrease ${criterion.name}`}
          className={stepButton}
          disabled={!enabled || sliderValue <= 0}
          onClick={() => onChange(criterion.id, sliderValue - 1)}
        >
          <Minus size={24} />
        </button>
        <output
          aria-live="polite"
          aria-label={`${criterion.name} score`}
          className={`min-w-24 text-center text-2xl font-bold tabular-nums ${
            value == null ? 'text-gray-400 dark:text-gray-500' : 'text-primary dark:text-primary'
          }`}
        >
          {value ?? '–'} <span className="text-base font-medium">/ {criterion.maxMarks}</span>
        </output>
        <button
          type="button"
          aria-label={`Increase ${criterion.name}`}
          className={stepButton}
          disabled={!enabled || (value ?? -1) >= criterion.maxMarks}
          onClick={() => onChange(criterion.id, (value ?? -1) + 1)}
        >
          <Plus size={24} />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={criterion.maxMarks}
        step={1}
        value={sliderValue}
        disabled={!enabled}
        aria-label={`${criterion.name} slider`}
        aria-valuetext={value == null ? 'Not marked' : `${value} out of ${criterion.maxMarks}`}
        onChange={(event) => onChange(criterion.id, Number(event.target.value))}
        className="mt-2 h-11 w-full cursor-pointer touch-pan-y accent-primary disabled:cursor-default disabled:opacity-50 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6"
      />
      <div aria-hidden="true" className="-mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>0</span>
        <span>{criterion.maxMarks}</span>
      </div>
      {value == null && (
        <p
          className={`mt-2 text-xs ${
            showRequired ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {showRequired
            ? 'Please mark this criterion before submitting.'
            : enabled
              ? 'Not marked yet — drag the slider or use + / −'
              : 'Not marked'}
        </p>
      )}
    </Card>
  );
});
