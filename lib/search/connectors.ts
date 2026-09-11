/* eslint-disable typescript/no-explicit-any -- External catalog payloads are heterogeneous and are normalized through sourceCandidate before leaving this module. */
import type {
  SourceCandidate,
  SourceSearchAction,
} from '../harness/source-search-tools';
import { sourceCandidate } from '../harness/source-search-tools';
import { fixedJson } from './safe-fetch';

export type SearchCredentials = {
  webProvider?: 'brave' | 'tavily';
  webKey?: string;
  dplaKey?: string;
};

export type ConnectorSearch = {
  provider: string;
  query: string;
  status: 'completed' | 'unavailable';
  returned: number;
  error?: string;
};

const array = (value: unknown) =>
  Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const strings = (value: unknown) => array(value).map(text).filter(Boolean);

function candidate(
  provider: SourceCandidate['provider'],
  externalId: string,
  value: Partial<SourceCandidate> &
    Pick<SourceCandidate, 'title' | 'landing_url'>,
): SourceCandidate {
  return {
    id: `${provider}:${externalId}`.slice(0, 1000),
    provider,
    external_id: externalId.slice(0, 1000),
    creators: [],
    issued_date: '',
    material_type: '',
    languages: [],
    institution: '',
    collection: '',
    doi: '',
    handle: '',
    ark: '',
    oclc: '',
    manifest_url: '',
    download_url: '',
    rights: '',
    license: '',
    access_status: 'metadata',
    snippet: '',
    verification_level: 'metadata',
    ...value,
  };
}

function dateParts(value: unknown) {
  if (!Array.isArray(value)) return '';
  const first = value[0];
  return Array.isArray(first) ? first.map(text).filter(Boolean).join('-') : '';
}

async function crossref(query: string, request: typeof fetch) {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query.bibliographic', query);
  url.searchParams.set('rows', '10');
  const raw = (await fixedJson(url.href, ['api.crossref.org'], request)) as any;
  return array(raw?.message?.items).map((item: any) => {
    const doi = text(item?.DOI).toLocaleLowerCase();
    const license = text(array(item?.license)[0]?.URL);
    return candidate('crossref', doi || text(item?.URL), {
      title: strings(item?.title).join(' · ') || 'Untitled Crossref record',
      landing_url: doi ? `https://doi.org/${doi}` : text(item?.URL),
      creators: array(item?.author)
        .map((author: any) =>
          [text(author?.given), text(author?.family)].filter(Boolean).join(' '),
        )
        .filter(Boolean),
      issued_date: dateParts(item?.published?.['date-parts']),
      material_type: text(item?.type),
      institution: text(item?.publisher),
      doi,
      license,
      rights: license,
      access_status: license ? 'open' : 'metadata',
      snippet: text(item?.abstract)
        .replace(/<[^>]+>/g, ' ')
        .slice(0, 8000),
      verification_level: item?.abstract ? 'abstract' : 'metadata',
    });
  });
}

function openAlexAbstract(index: unknown) {
  if (!index || typeof index !== 'object') return '';
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(index))
    for (const position of array(positions))
      if (Number.isInteger(position)) words.push([word, Number(position)]);
  return words
    .sort((a, b) => a[1] - b[1])
    .map(([word]) => word)
    .join(' ');
}

async function openalex(query: string, request: typeof fetch) {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', query);
  url.searchParams.set('per_page', '10');
  const raw = (await fixedJson(url.href, ['api.openalex.org'], request)) as any;
  return array(raw?.results).map((item: any) => {
    const id = text(item?.id).split('/').pop() || text(item?.doi);
    const oa = item?.best_oa_location || {};
    const doi = text(item?.doi).replace(/^https:\/\/doi\.org\//i, '');
    const snippet = openAlexAbstract(item?.abstract_inverted_index);
    return candidate('openalex', id, {
      title:
        text(item?.display_name || item?.title) || 'Untitled OpenAlex record',
      landing_url: text(
        item?.primary_location?.landing_page_url || item?.doi || item?.id,
      ),
      creators: array(item?.authorships)
        .map((authorship: any) => text(authorship?.author?.display_name))
        .filter(Boolean),
      issued_date: text(item?.publication_date || item?.publication_year),
      material_type: text(item?.type),
      languages: strings(item?.language),
      institution: strings(
        array(item?.authorships).flatMap((authorship: any) =>
          array(authorship?.institutions).map(
            (institution: any) => institution?.display_name,
          ),
        ),
      ).join(' · '),
      doi,
      download_url: text(oa?.pdf_url),
      rights: text(oa?.license),
      license: text(oa?.license),
      access_status: oa?.is_oa ? 'open' : 'metadata',
      snippet: snippet.slice(0, 8000),
      verification_level: snippet ? 'abstract' : 'metadata',
    });
  });
}

async function loc(query: string, request: typeof fetch) {
  const url = new URL('https://www.loc.gov/search/');
  url.searchParams.set('q', query);
  url.searchParams.set('fo', 'json');
  url.searchParams.set('c', '10');
  const raw = (await fixedJson(url.href, ['www.loc.gov'], request)) as any;
  return array(raw?.results).map((item: any) => {
    const landing = text(item?.id || item?.url);
    const downloads = array(item?.resources)
      .flatMap((resource: any) => array(resource?.files))
      .flatMap((file: any) => array(file))
      .map((file: any) => text(file?.url || file))
      .filter((url: string) => /^https:\/\//i.test(url));
    return candidate('loc', landing, {
      title: text(item?.title) || 'Untitled Library of Congress record',
      landing_url: landing,
      creators: strings(item?.contributor || item?.creator),
      issued_date: text(item?.date),
      material_type: strings(item?.original_format || item?.type).join(' · '),
      languages: strings(item?.language),
      institution: 'Library of Congress',
      collection: strings(item?.partof).join(' · '),
      download_url: downloads[0] || '',
      rights: text(item?.rights || item?.rights_advisory),
      access_status: item?.online_format ? 'public' : 'metadata',
      snippet: strings(item?.description).join(' ').slice(0, 8000),
    });
  });
}

function recursiveStrings(
  value: unknown,
  keys: Set<string>,
  found: string[] = [],
) {
  if (Array.isArray(value)) {
    for (const item of value) recursiveStrings(item, keys, found);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (keys.has(key)) found.push(...strings(item));
      recursiveStrings(item, keys, found);
    }
  }
  return found;
}

async function harvard(query: string, request: typeof fetch) {
  const url = new URL('https://api.lib.harvard.edu/v2/items.json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '10');
  const raw = (await fixedJson(
    url.href,
    ['api.lib.harvard.edu'],
    request,
  )) as any;
  const items = array(
    raw?.items?.mods || raw?.items?.dc || raw?.items || raw?.mods,
  );
  return items.map((item: any, index) => {
    const ids = recursiveStrings(
      item,
      new Set(['recordIdentifier', 'identifier']),
    );
    const urls = recursiveStrings(item, new Set(['url'])).filter((value) =>
      /^https:\/\//i.test(value),
    );
    const title = recursiveStrings(item, new Set(['title'])).join(' · ');
    const rawObject = urls.find((value) =>
      /iiif|download|delivery|drs/i.test(value),
    );
    return candidate('harvard', ids[0] || urls[0] || `${query}:${index}`, {
      title: title || 'Untitled Harvard Library record',
      landing_url:
        urls[0] ||
        `https://hollis.harvard.edu/primo-explore/search?query=any,contains,${encodeURIComponent(query)}`,
      creators: recursiveStrings(item, new Set(['namePart', 'creator'])).slice(
        0,
        50,
      ),
      issued_date:
        recursiveStrings(item, new Set(['dateIssued', 'dateCreated']))[0] || '',
      material_type: recursiveStrings(
        item,
        new Set(['typeOfResource', 'genre']),
      ).join(' · '),
      languages: recursiveStrings(item, new Set(['languageTerm'])),
      institution: 'Harvard Library',
      collection: recursiveStrings(
        item,
        new Set(['setName', 'collectionTitle']),
      ).join(' · '),
      download_url: rawObject || '',
      rights: recursiveStrings(
        item,
        new Set(['accessCondition', 'rights']),
      ).join(' · '),
      access_status: rawObject ? 'public' : 'metadata',
      snippet: recursiveStrings(
        item,
        new Set(['abstract', 'note', 'tableOfContents']),
      )
        .join(' ')
        .slice(0, 8000),
    });
  });
}

async function dpla(query: string, key: string, request: typeof fetch) {
  const url = new URL('https://api.dp.la/v2/items');
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', '10');
  url.searchParams.set('api_key', key);
  const raw = (await fixedJson(url.href, ['api.dp.la'], request)) as any;
  return array(raw?.docs).map((item: any) => {
    const source = item?.sourceResource || {};
    const landing = text(item?.isShownAt || item?.['@id']);
    return candidate('dpla', text(item?.id || item?.['@id']), {
      title: text(source?.title) || 'Untitled DPLA record',
      landing_url: landing,
      creators: strings(source?.creator),
      issued_date: text(source?.date?.displayDate || source?.date),
      material_type: text(source?.type),
      languages: strings(source?.language),
      institution: text(item?.dataProvider),
      collection: text(source?.collection?.title || source?.collection),
      rights: text(source?.rights || item?.object?.rights),
      access_status: 'metadata',
      snippet: strings(source?.description).join(' ').slice(0, 8000),
    });
  });
}

async function brave(
  action: Extract<SourceSearchAction, { tool: 'search' }>,
  key: string,
  request: typeof fetch,
) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  const domainFilter = (action.domains || [])
    .map((domain) => `site:${domain}`)
    .join(' OR ');
  url.searchParams.set(
    'q',
    domainFilter ? `${action.query} (${domainFilter})` : action.query,
  );
  url.searchParams.set('count', '10');
  if (action.language)
    url.searchParams.set('search_lang', action.language.slice(0, 2));
  const raw = (await fixedJson(url.href, ['api.search.brave.com'], request, {
    headers: { 'X-Subscription-Token': key },
  })) as any;
  return array(raw?.web?.results).map((item: any) =>
    candidate('web', text(item?.url), {
      title: text(item?.title) || 'Untitled web result',
      landing_url: text(item?.url),
      issued_date: text(item?.page_age || item?.age),
      institution: (() => {
        try {
          return new URL(text(item?.url)).hostname;
        } catch {
          return '';
        }
      })(),
      snippet: text(item?.description).slice(0, 8000),
      access_status: 'public',
    }),
  );
}

async function tavily(
  action: Extract<SourceSearchAction, { tool: 'search' }>,
  key: string,
  request: typeof fetch,
) {
  const raw = (await fixedJson(
    'https://api.tavily.com/search',
    ['api.tavily.com'],
    request,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: action.query,
        search_depth: 'advanced',
        max_results: 10,
        include_domains: action.domains,
        include_raw_content: false,
      }),
    },
  )) as any;
  return array(raw?.results).map((item: any) =>
    candidate('web', text(item?.url), {
      title: text(item?.title) || 'Untitled web result',
      landing_url: text(item?.url),
      institution: (() => {
        try {
          return new URL(text(item?.url)).hostname;
        } catch {
          return '';
        }
      })(),
      snippet: text(item?.content).slice(0, 8000),
      access_status: 'public',
    }),
  );
}

async function contentdm(query: string, request: typeof fetch) {
  const encoded = encodeURIComponent(query).replaceAll('%2F', '');
  const url = `https://digitalcollections.lib.washington.edu/digital/api/search/searchterm/${encoded}/field/all/maxRecords/10`;
  const raw = (await fixedJson(
    url,
    ['digitalcollections.lib.washington.edu'],
    request,
  )) as any;
  return array(raw?.items).map((item: any) => {
    const pointer = text(
      item?.itemLink || item?.item || item?.item_id || item?.itemLink,
    );
    const landing = pointer.startsWith('https://')
      ? pointer
      : `https://digitalcollections.lib.washington.edu/digital/collection/${text(item?.collectionAlias || item?.collection)}/id/${text(item?.item || item?.item_id)}`;
    return candidate('contentdm', landing, {
      title: text(item?.title) || 'Untitled UW digital collection record',
      landing_url: landing,
      creators: strings(item?.creato || item?.creator),
      issued_date: text(item?.date),
      material_type: text(item?.type),
      institution: 'University of Washington Libraries',
      collection: text(item?.collection || item?.collectionName),
      snippet: text(item?.descri || item?.description).slice(0, 8000),
      access_status: 'public',
      verification_level:
        item?.descri || item?.description ? 'finding_aid' : 'metadata',
    });
  });
}

function dspaceMetadata(object: any, key: string) {
  return strings(object?.metadata?.[key]).map((value) =>
    typeof value === 'string' ? value : text((value as any)?.value),
  );
}

async function dspaceHost(
  host: string,
  institution: string,
  query: string,
  request: typeof fetch,
) {
  const url = new URL(`https://${host}/server/api/discover/search/objects`);
  url.searchParams.set('query', query);
  url.searchParams.set('size', '10');
  const raw = (await fixedJson(url.href, [host], request)) as any;
  const objects = array(raw?._embedded?.searchResult?._embedded?.objects);
  return objects.map((entry: any) => {
    const item =
      entry?._embedded?.indexableObject || entry?.indexableObject || entry;
    const id = text(item?.uuid || item?.id);
    const title = text(item?.name) || dspaceMetadata(item, 'dc.title')[0];
    const handle =
      dspaceMetadata(item, 'dc.identifier.uri').find((value) =>
        /handle/i.test(value),
      ) || '';
    const landing = handle.startsWith('https://')
      ? handle
      : `https://${host}/items/${id}`;
    return candidate('dspace', `${host}:${id}`, {
      title: title || 'Untitled institutional repository record',
      landing_url: landing,
      creators: dspaceMetadata(item, 'dc.contributor.author'),
      issued_date: dspaceMetadata(item, 'dc.date.issued')[0] || '',
      material_type: dspaceMetadata(item, 'dc.type').join(' · '),
      languages: dspaceMetadata(item, 'dc.language.iso'),
      institution,
      handle,
      rights: dspaceMetadata(item, 'dc.rights').join(' · '),
      snippet: dspaceMetadata(item, 'dc.description.abstract')
        .join(' ')
        .slice(0, 8000),
      access_status: 'metadata',
      verification_level: dspaceMetadata(item, 'dc.description.abstract').length
        ? 'abstract'
        : 'metadata',
    });
  });
}

async function dspace(query: string, request: typeof fetch) {
  const results = await Promise.allSettled([
    dspaceHost(
      'digital.lib.washington.edu',
      'University of Washington Libraries',
      query,
      request,
    ),
    dspaceHost(
      'ecommons.cornell.edu',
      'Cornell University Library',
      query,
      request,
    ),
  ]);
  const values = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );
  if (!values.length && results.every((result) => result.status === 'rejected'))
    throw new Error('Institutional repository connectors unavailable');
  return values.slice(0, 10);
}

export async function runConnectorSearch(
  action: Extract<SourceSearchAction, { tool: 'search' }>,
  credentials: SearchCredentials = {},
  request: typeof fetch = fetch,
) {
  const candidates: SourceCandidate[] = [];
  const searches: ConnectorSearch[] = [];
  for (const provider of new Set(action.providers)) {
    try {
      let values: SourceCandidate[];
      if (provider === 'crossref')
        values = await crossref(action.query, request);
      else if (provider === 'openalex')
        values = await openalex(action.query, request);
      else if (provider === 'loc') values = await loc(action.query, request);
      else if (provider === 'harvard')
        values = await harvard(action.query, request);
      else if (provider === 'contentdm')
        values = await contentdm(action.query, request);
      else if (provider === 'dspace')
        values = await dspace(action.query, request);
      else if (provider === 'dpla') {
        if (!credentials.dplaKey)
          throw new Error('DPLA connection not configured');
        values = await dpla(action.query, credentials.dplaKey, request);
      } else if (provider === 'web') {
        if (!credentials.webProvider || !credentials.webKey)
          throw new Error('Web search connection not configured');
        values =
          credentials.webProvider === 'brave'
            ? await brave(action, credentials.webKey, request)
            : await tavily(action, credentials.webKey, request);
      } else {
        throw new Error('Connector requires a collection or inspected record');
      }
      const valid = values.flatMap((value) => {
        const parsed = sourceCandidate.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      });
      candidates.push(...valid.slice(0, 10));
      searches.push({
        provider,
        query: action.query,
        status: 'completed',
        returned: valid.length,
      });
    } catch (error) {
      searches.push({
        provider,
        query: action.query,
        status: 'unavailable',
        returned: 0,
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : 'Connector unavailable',
      });
    }
  }
  return {
    candidates: [
      ...new Map(candidates.map((item) => [item.id, item] as const)).values(),
    ].slice(0, 30),
    searches,
  };
}
