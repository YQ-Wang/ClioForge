'use client';

import { useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './button';

export function FilePicker({
  label,
  description,
  accept,
  disabled,
  onSelect,
}: {
  label: string;
  description?: string;
  accept: string;
  disabled?: boolean;
  onSelect: (file: File) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  const [name, setName] = useState('');
  const [reading, setReading] = useState(false);
  return (
    <div className="file-picker">
      {description && <p id={hint}>{description}</p>}
      <div className="file-picker-selection">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || reading}
          aria-describedby={description ? hint : undefined}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          {label}
        </Button>
        <span role="status" title={name}>
          {name}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        style={{ display: 'none' }}
        accept={accept}
        disabled={disabled || reading}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          setName(file.name);
          setReading(true);
          try {
            await onSelect(file);
          } finally {
            setReading(false);
          }
        }}
      />
    </div>
  );
}
