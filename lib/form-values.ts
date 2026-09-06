export const textValue = (value: unknown) =>
  typeof value === 'string' ? value : '';
export const formText = (form: FormData, key: string) =>
  textValue(form.get(key));
