declare module '@citation-js/core' {
  export class Cite {
    constructor(data: unknown, options?: Record<string, unknown>);
    data: import('../lib/workbench-types').CSL[];
    format(format: string, options?: Record<string, unknown>): string;
  }
  export const plugins: {
    config: {
      get(name: string): {
        styles: { add(name: string, style: string): void };
        format: { asciiOnly: boolean; useIdAsLabel: boolean };
      };
    };
  };
}
declare module '@citation-js/plugin-csl';
declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-ris';
