'use client';
import { DEFAULT_RESEARCH_MODEL, GLM_PRICE_CEILING } from '@/lib/model-routing';
import { useI18n } from '@/lib/i18n/provider';
import { useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/client-api';
import type { Model } from '@/lib/types';
import { Field, Notice } from './workspace';
import ModelPriceSettings from './model-price-settings';
export const modelColumns =
  'id,label,provider,model_id,vision,key_hint,created_at';
export default function ModelSettings({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { t, locale } = useI18n();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [models, setModels] = useState<Model[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [vision, setVision] = useState(true);
  const [preset, setPreset] = useState(true);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try {
      const data = await api<{ models: Model[] }>('/api/workspace?models=1');
      setModels(data.models);
    } catch {
      setMessage('无法读取模型连接。');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      await api('/api/models', {
        label: data.get('label'),
        provider: data.get('provider'),
        model_id: data.get('model_id'),
        key: data.get('key'),
        vision,
      });
      form.reset();
      setOpen(false);
      setVision(true);
      setMessage('已加密保存。首次研究任务会验证厂商连接，并可能产生费用。');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await api('/api/models', { id }, 'DELETE');
      await refresh();
      setMessage('连接已移除，已有任务记录仍保留。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '移除失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={embedded ? 'section-toolbar' : 'page-title'}>
        <div>
          {!embedded && <p className="eyebrow">{t('使用你自己的模型')}</p>}
          {!embedded && <h1>{t('助手设置')}</h1>}
          <p className="text-muted-foreground mt-2">
            {t('为每次研究任务明确选择厂商和模型。')}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} />
          {t('添加连接')}
        </Button>
      </div>
      {message && <Notice text={message} />}
      {loading && (
        <div
          className="project-grid"
          aria-label={t('正在读取模型连接')}
          aria-busy="true"
        >
          {[1, 2].map((i) => (
            <div className="project-skeleton" key={i} />
          ))}
        </div>
      )}
      <div className="project-grid">
        {models.map((model) => (
          <section className="project-card" key={model.id}>
            <div className="flex justify-between">
              <span className="path-icon purple">
                <KeyRound size={23} />
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('移除 {0}', { 0: model.label })}
                disabled={busy}
                onClick={() => void remove(model.id)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
            <h2 className="mt-4">{model.label}</h2>
            <p>
              {model.provider} · {model.model_id}
            </p>
            <div className="model-key">
              <span className="status-tag">
                {model.vision ? t('图像 + 文本') : t('文本')}
              </span>
              <code>{model.key_hint}</code>
            </div>
          </section>
        ))}
      </div>
      {!loading && !models.length && (
        <section className="empty-project">
          <span className="folio-mark">
            <KeyRound size={30} />
          </span>
          <h2>{t('选择适合材料的模型')}</h2>
          <p className="mt-2">
            {t('密钥在服务端加密保存；任务只发送你选中的材料。')}
          </p>
          <div className="provider-list">
            {['OpenAI', 'Anthropic', 'Google', 'OpenRouter'].map((provider) => (
              <span key={provider}>{provider}</span>
            ))}
          </div>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setOpen(true)}
          >
            <Plus size={16} />
            {t('添加第一个模型')}
          </Button>
        </section>
      )}
      <ModelPriceSettings models={models} />
      <Notice
        text={L(
          '费用由你的 API 账户承担。OCR、即时分析和后台研究共同使用项目「任务与关注」中的预算。',
          'Your API account pays provider charges. OCR, direct analysis and background research share the budget under project Tasks & watches.',
        )}
      />
      <div className="workspace-note">
        <ShieldCheck size={16} />
        <p>{t('每次运行都记录所用模型与资料版本，便于回溯研究过程。')}</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('添加模型连接')}</DialogTitle>
            <DialogDescription>
              {t(
                '请填写厂商 API 中的实际模型 ID。启用图像前，请确认模型支持图像输入。',
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {L(
                '推荐工作模型：GLM 5.3 Flash。简单提取和 OCR 使用 low，材料比较和证据分析使用 high，规划与综合使用 max；关键结论仍需复核。',
                'Recommended working model: GLM 5.3 Flash. Low for extraction and OCR, high for comparisons and evidence analysis, max for planning and synthesis. Important conclusions require review.',
              )}
            </p>
            <Field label={t('连接名称')}>
              <Input
                name="label"
                required
                maxLength={100}
                placeholder={t('我的阅读模型')}
                defaultValue="GLM 5.3 Flash"
              />
            </Field>
            <Field label={t('厂商')}>
              <NativeSelect
                name="provider"
                className="w-full"
                defaultValue="openrouter"
                onChange={(event) => {
                  setPreset(event.target.value === 'openrouter');
                  setVision(event.target.value === 'openrouter');
                }}
              >
                <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
                <NativeSelectOption value="anthropic">
                  Anthropic
                </NativeSelectOption>
                <NativeSelectOption value="google">
                  Google Gemini
                </NativeSelectOption>
                <NativeSelectOption value="openrouter">
                  OpenRouter
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label={t('模型 ID')}>
              <Input
                name="model_id"
                key={preset ? 'glm' : 'custom'}
                defaultValue={preset ? DEFAULT_RESEARCH_MODEL : ''}
                required
                maxLength={150}
                placeholder={t('填写厂商提供的模型 ID')}
              />
            </Field>
            {preset && (
              <small>
                {L(
                  `路由价格上限：输入 $${GLM_PRICE_CEILING.input} / 输出 $${GLM_PRICE_CEILING.output} 每百万 token（不依赖限时优惠）。使用你自己的 API key。`,
                  `Routing price ceilings: $${GLM_PRICE_CEILING.input} input / $${GLM_PRICE_CEILING.output} output per million tokens, without relying on temporary discounts. Uses your own API key.`,
                )}
              </small>
            )}
            <Field label="API key">
              <Input
                name="key"
                type="password"
                autoComplete="off"
                required
                maxLength={4000}
              />
            </Field>
            <label
              htmlFor="model-vision"
              className="flex gap-2 items-center text-sm"
            >
              <Checkbox
                id="model-vision"
                checked={vision}
                onCheckedChange={(value) => setVision(value === true)}
              />
              {t('此模型支持图像输入（用于 OCR）')}
            </label>
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t('取消')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t('正在加密保存…') : t('保存连接')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
