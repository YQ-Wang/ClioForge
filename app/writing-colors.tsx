'use client';
import { writingColor } from '@/lib/writing-color';
import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Baseline, Highlighter, Check, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n/provider';
const colors = [
  ['#374151', '石墨', 'Graphite'],
  ['#b91c1c', '红色', 'Red'],
  ['#b45309', '琥珀', 'Amber'],
  ['#15803d', '绿色', 'Green'],
  ['#1d4ed8', '蓝色', 'Blue'],
  ['#7e22ce', '紫色', 'Purple'],
];
const highlights = [
  ['#fef08a', '黄色', 'Yellow'],
  ['#fed7aa', '蜜桃', 'Peach'],
  ['#bbf7d0', '薄荷', 'Mint'],
  ['#bfdbfe', '浅蓝', 'Sky'],
  ['#e9d5ff', '淡紫', 'Lavender'],
  ['#fbcfe8', '粉色', 'Pink'],
];
export default function WritingColors({
  editor,
  highlight = false,
}: {
  editor: Editor;
  highlight?: boolean;
}) {
  const { locale } = useI18n(),
    en = locale === 'en';
  const [open, setOpen] = useState(false);
  const label = highlight
    ? en
      ? 'Text highlight'
      : '文字高亮'
    : en
      ? 'Text color'
      : '文字颜色';
  const active = writingColor(
    editor.getAttributes('textStyle')[highlight ? 'backgroundColor' : 'color'],
  );
  function apply(value: string | null) {
    const chain = editor.chain().focus();
    if (highlight) {
      if (value) chain.setBackgroundColor(value).run();
      else chain.unsetBackgroundColor().run();
    } else {
      if (value) chain.setColor(value).run();
      else chain.unsetColor().run();
    }
    setOpen(false);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={label}
            title={label}
          />
        }
      >
        {highlight ? <Highlighter size={16} /> : <Baseline size={16} />}
        <span
          className="writing-color-indicator"
          style={{
            background: active || (highlight ? '#fef08a' : 'currentColor'),
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="writing-palette"
        align="start"
        finalFocus={false}
      >
        <PopoverTitle>{label}</PopoverTitle>
        <fieldset className="writing-swatches" aria-label={label}>
          {(highlight ? highlights : colors).map(([value, zh, english]) => (
            <button
              key={value}
              type="button"
              title={en ? english : zh}
              aria-label={`${label}: ${en ? english : zh}`}
              aria-pressed={active === value}
              style={{ background: value }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(value)}
            >
              {active === value && (
                <Check size={16} color={highlight ? '#1f2937' : '#fff'} />
              )}
            </button>
          ))}
        </fieldset>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => apply(null)}
        >
          <Eraser size={14} />
          {highlight
            ? en
              ? 'Remove highlight'
              : '取消高亮'
            : en
              ? 'Default text color'
              : '默认文字颜色'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
