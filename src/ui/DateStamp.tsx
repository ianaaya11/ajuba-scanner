import { useState } from 'react';
import { Overlay } from './components';

const FORMATS: { id: string; label: string; format: (d: Date) => string }[] = [
  { id: 'long', label: '28 August 2026', format: (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) },
  { id: 'short', label: '28/08/2026', format: (d) => d.toLocaleDateString('en-GB') },
  { id: 'iso', label: '2026-08-28', format: (d) => d.toISOString().slice(0, 10) },
  { id: 'us', label: 'August 28, 2026', format: (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) },
];

/** Picks a date and how it should read, or takes free text instead. */
export default function DateStamp({
  onDone,
  onCancel,
}: {
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [formatId, setFormatId] = useState('long');
  const [custom, setCustom] = useState('');

  // Parse as local noon: parsing a bare YYYY-MM-DD gives UTC midnight, which
  // reads as the previous day for anyone west of Greenwich.
  const parsed = new Date(`${value}T12:00:00`);
  const valid = !Number.isNaN(parsed.getTime());
  const chosen = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  const preview = custom.trim() || (valid ? chosen.format(parsed) : '');

  return (
    <Overlay onClose={onCancel}>
      <h2>Add a date</h2>

      <input
        type="date"
        className="date-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Date"
      />

      <div className="format-list">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            className="chip"
            aria-pressed={formatId === f.id && !custom.trim()}
            onClick={() => {
              setFormatId(f.id);
              setCustom('');
            }}
          >
            {valid ? f.format(parsed) : f.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        placeholder="…or type anything instead"
        aria-label="Custom text"
      />

      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          style={{ flex: 1 }}
          disabled={!preview}
          onClick={() => onDone(preview)}
        >
          Place
        </button>
      </div>
    </Overlay>
  );
}
