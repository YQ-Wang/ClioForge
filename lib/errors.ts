export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function textField(value: unknown, name: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new HttpError(400, `${name}为空或过长。`);
  return value.trim();
}
