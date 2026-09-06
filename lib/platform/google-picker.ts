'use client';

type Picker = { setVisible(value: boolean): void; dispose(): void };
type Builder = {
  setDeveloperKey(value: string): Builder;
  setAppId(value: string): Builder;
  setOAuthToken(value: string): Builder;
  setOrigin(value: string): Builder;
  setLocale(value: string): Builder;
  addView(value: unknown): Builder;
  enableFeature(value: unknown): Builder;
  setCallback(
    callback: (data: { action: string; docs?: { id: string }[] }) => void,
  ): Builder;
  build(): Picker;
};
type GoogleWindow = Window & {
  gapi?: {
    load(
      name: string,
      options: {
        callback(): void;
        onerror(): void;
        timeout: number;
        ontimeout(): void;
      },
    ): void;
  };
  google?: {
    picker: {
      PickerBuilder: new () => Builder;
      View: new (id: unknown) => { setMimeTypes(value: string): unknown };
      ViewId: { DOCS: unknown };
      Feature: { MULTISELECT_ENABLED: unknown };
      Action: { PICKED: string; CANCEL: string };
    };
  };
};

let loading: Promise<void> | undefined;
function loadPicker() {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const target = window as GoogleWindow;
    const fail = () =>
      reject(new Error('Google Picker could not load. Please retry.'));
    const ready = () =>
      target.gapi?.load('picker', {
        callback: resolve,
        onerror: fail,
        timeout: 15000,
        ontimeout: fail,
      });
    if (target.gapi) ready();
    else {
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        script.remove();
        fail();
      }, 15000);
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timeout);
        ready();
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        script.remove();
        fail();
      };
      document.head.appendChild(script);
    }
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export async function pickGoogleFiles(
  config: { apiKey: string; appId: string; accessToken: string },
  locale: string,
) {
  await loadPicker();
  const google = (window as GoogleWindow).google;
  if (!google?.picker) throw new Error('Google Picker is unavailable.');
  return new Promise<string[]>((resolve) => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes(
      'application/pdf,text/plain,text/markdown,image/png,image/jpeg,image/webp,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation',
    );
    const picker = new google.picker.PickerBuilder()
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setOAuthToken(config.accessToken)
      .setOrigin(window.location.origin)
      .setLocale(locale === 'en' ? 'en' : 'zh-CN')
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .addView(view)
      .setCallback((data) => {
        if (
          data.action === google.picker.Action.PICKED ||
          data.action === google.picker.Action.CANCEL
        ) {
          picker.dispose();
          resolve(
            data.action === google.picker.Action.PICKED
              ? (data.docs || []).map((doc) => doc.id).slice(0, 20)
              : [],
          );
        }
      })
      .build();
    picker.setVisible(true);
  });
}
