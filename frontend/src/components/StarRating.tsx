import { useState } from 'react';
import { Star } from 'lucide-react';

// Bintang penilaian 1-5. Klik untuk memilih; hover memberi pratinjau.
export default function StarRating({
  value,
  onChange,
  disabled = false,
  size = 28,
}: {
  value: number;
  onChange?: (stars: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Penilaian bintang 1 sampai 5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        const Icon = (
          <Star
            size={size}
            className={filled ? 'fill-amber-300 text-amber-300' : 'text-slate-600'}
          />
        );
        if (disabled || !onChange) return <span key={star}>{Icon}</span>;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} bintang`}
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {Icon}
          </button>
        );
      })}
    </div>
  );
}
