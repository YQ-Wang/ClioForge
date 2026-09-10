'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import {
  DEFAULT_RESEARCH_MODEL,
  FIREWORKS_KIMI_K3_MODEL,
  FIREWORKS_KIMI_K3_RATES,
  GLM_PRICE_CEILING,
} from '@/lib/model-routing';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Field } from './workspace';
import type { Model } from '@/lib/types';
function includedRates(model: Model | undefined) {
  if (
    model?.provider === 'openrouter' &&
    model.model_id === DEFAULT_RESEARCH_MODEL
  )
    return GLM_PRICE_CEILING;
  if (
    model?.provider === 'fireworks' &&
    model.model_id === FIREWORKS_KIMI_K3_MODEL
  )
    return FIREWORKS_KIMI_K3_RATES;
  return undefined;
}
export default function ModelPriceSettings({ models }: { models: Model[] }) {
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [id, setId] = useState(''),
    [input, setInput] = useState(''),
    [output, setOutput] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [prices, setPrices] = useState<
    { model_id: string; input_rate: number; output_rate: number }[]
  >([]);
  useEffect(() => {
    void api<{ prices: typeof prices }>('/api/models/pricing')
      .then((data) => {
        setPrices(data.prices);
        if (data.prices[0]) setId(data.prices[0].model_id);
      })
      .catch(() =>
        setMessage(
          locale === 'en' ? 'Could not load rates.' : '暂时无法读取费率。',
        ),
      );
  }, [locale]);
  useEffect(() => {
    const model = models.find((m) => m.id === id);
    const price = prices.find((p) => p.model_id === id);
    const defaults = includedRates(model);
    setInput(
      price ? String(price.input_rate) : defaults ? String(defaults.input) : '',
    );
    setOutput(
      price
        ? String(price.output_rate)
        : defaults
          ? String(defaults.output)
          : '',
    );
  }, [id, models, prices]);
  if (!models.length) return null;
  return (
    <form
      className="settings-card mt-6"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        void api('/api/models/pricing', {
          model_id: id,
          input_rate: Number(input),
          output_rate: Number(output),
        })
          .then(() =>
            setMessage(
              L(
                '已保存 OCR 与即时分析的默认模型和费率。',
                'Saved the default model and rates for OCR and direct analysis.',
              ),
            ),
          )
          .catch((e) => setMessage(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <h2>
        {L(
          '转录与即时分析的默认模型',
          'Default model for transcription and direct analysis',
        )}
      </h2>
      <p>
        {L(
          'GLM 5.3 Flash 与 Fireworks Kimi K3 可直接使用内置费率。其它模型请填写厂商费率，用于项目预算预留；不会充值，也不会产生模型调用。',
          'GLM 5.3 Flash and Fireworks Kimi K3 include default rates. For another model, enter provider rates for project budget reservations. Saving does not top up or call a model.',
        )}
      </p>
      <Field label={L('模型连接', 'Model connection')}>
        <NativeSelect
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
        >
          <NativeSelectOption value="">
            {L('选择模型', 'Choose a model')}
          </NativeSelectOption>
          {models.map((model) => (
            <NativeSelectOption key={model.id} value={model.id}>
              {model.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <div className="usage-grid">
        <Field
          label={L(
            '输入费率（USD / 百万 token）',
            'Input rate (USD / million tokens)',
          )}
        >
          <Input
            type="number"
            min="0.000001"
            max="10000"
            step="any"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            required
          />
        </Field>
        <Field
          label={L(
            '输出费率（USD / 百万 token）',
            'Output rate (USD / million tokens)',
          )}
        >
          <Input
            type="number"
            min="0.000001"
            max="10000"
            step="any"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            required
          />
        </Field>
      </div>
      <p className="settings-hint">
        {L(
          '费率是估算依据，不能保证厂商最终账单。每个项目的预算单独设置。',
          'Rates support estimates, not a guarantee of provider billing. Set the budget separately for each project.',
        )}
      </p>
      <Button type="submit" disabled={busy || !id}>
        {L('保存默认模型与费率', 'Save default model and rates')}
      </Button>
      {message && <output>{message}</output>}
    </form>
  );
}
