const { Client } = require('@opensearch-project/opensearch');

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://opensearch:9200';

let client;
let searchBackend = isOpenSearchConfigured() ? 'opensearch' : 'memory';
const memoryIndexes = {};

function isOpenSearchConfigured() {
  const flag = String(process.env.OPENSEARCH_ENABLED ?? 'true').toLowerCase();
  return !['false', '0', 'no', 'off'].includes(flag);
}

function initMemoryIndexes() {
  for (const index of Object.keys(INDEX_DEFINITIONS)) {
    if (!memoryIndexes[index]) {
      memoryIndexes[index] = new Map();
    }
  }
}

function getClient() {
  if (!client) {
    client = new Client({ node: OPENSEARCH_URL });
  }
  return client;
}

const INDEX_DEFINITIONS = {
  citizens: {
    mappings: {
      properties: {
        id: { type: 'integer' },
        nationalId: { type: 'keyword' },
        firstName: { type: 'text', fields: { raw: { type: 'keyword' } } },
        lastName: { type: 'text', fields: { raw: { type: 'keyword' } } },
        email: { type: 'keyword' },
        status: { type: 'keyword' },
        region: { type: 'keyword' },
        indexedAt: { type: 'date' }
      }
    }
  },
  documents: {
    mappings: {
      properties: {
        id: { type: 'integer' },
        title: { type: 'text' },
        type: { type: 'keyword' },
        status: { type: 'keyword' },
        citizenId: { type: 'integer' },
        ministryId: { type: 'integer' },
        indexedAt: { type: 'date' }
      }
    }
  },
  audit_logs: {
    mappings: {
      properties: {
        id: { type: 'integer' },
        action: { type: 'keyword' },
        detail: { type: 'text' },
        actor: { type: 'keyword' },
        service: { type: 'keyword' },
        correlationId: { type: 'keyword' },
        createdAt: { type: 'date' }
      }
    }
  },
  reports: {
    mappings: {
      properties: {
        id: { type: 'integer' },
        type: { type: 'keyword' },
        title: { type: 'text' },
        status: { type: 'keyword' },
        generatedBy: { type: 'keyword' },
        generatedAt: { type: 'date' }
      }
    }
  },
  notifications: {
    mappings: {
      properties: {
        id: { type: 'integer' },
        userId: { type: 'integer' },
        channel: { type: 'keyword' },
        message: { type: 'text' },
        createdAt: { type: 'date' }
      }
    }
  }
};

const searchMetrics = {
  indexed: 0,
  failed: 0,
  queries: 0,
  queryLatencyMs: []
};

function useMemoryBackend() {
  searchBackend = 'memory';
  initMemoryIndexes();
}

async function ensureIndexes() {
  if (searchBackend === 'memory') {
    initMemoryIndexes();
    return;
  }
  try {
    const os = getClient();
    for (const [index, definition] of Object.entries(INDEX_DEFINITIONS)) {
      const exists = await os.indices.exists({ index });
      if (!exists.body) {
        await os.indices.create({ index, body: definition });
      }
    }
  } catch (err) {
    console.error(JSON.stringify({
      component: 'opensearch',
      warning: 'OpenSearch unreachable; using in-memory search indexes',
      error: err.message
    }));
    useMemoryBackend();
  }
}

async function indexDocumentMemory(index, id, document) {
  const start = Date.now();
  initMemoryIndexes();
  const body = { ...document, indexedAt: new Date().toISOString() };
  memoryIndexes[index].set(String(id), body);
  searchMetrics.indexed += 1;
  searchMetrics.queryLatencyMs.push(Date.now() - start);
  return true;
}

async function indexDocument(index, id, document) {
  if (searchBackend === 'memory') {
    return indexDocumentMemory(index, id, document);
  }
  const os = getClient();
  const start = Date.now();
  try {
    await os.index({
      index,
      id: String(id),
      body: { ...document, indexedAt: new Date().toISOString() },
      refresh: true
    });
    searchMetrics.indexed += 1;
    searchMetrics.queryLatencyMs.push(Date.now() - start);
    return true;
  } catch (err) {
    searchMetrics.failed += 1;
    console.error(JSON.stringify({
      component: 'opensearch',
      warning: 'index failed',
      index,
      id: String(id),
      error: err.message
    }));
    return indexDocumentMemory(index, id, document);
  }
}

function matchesQuery(document, query) {
  if (!query) return true;
  const haystack = JSON.stringify(document).toLowerCase();
  return haystack.includes(String(query).toLowerCase());
}

function matchesFilters(document, filters) {
  return Object.entries(filters).every(([field, value]) => document[field] === value);
}

async function searchIndexMemory(index, { query, filters = {}, from = 0, size = 20 }) {
  const start = Date.now();
  initMemoryIndexes();
  const store = memoryIndexes[index] || new Map();
  let hits = [...store.values()].filter((doc) => matchesQuery(doc, query) && matchesFilters(doc, filters));
  hits.sort((a, b) => String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')));
  const total = hits.length;
  hits = hits.slice(from, from + size).map((source, i) => ({
    id: String(source.id ?? from + i),
    score: 1,
    ...source
  }));
  searchMetrics.queries += 1;
  searchMetrics.queryLatencyMs.push(Date.now() - start);
  return { total, hits, facets: {}, took: Date.now() - start, backend: 'memory' };
}

async function searchIndex(index, { query, filters = {}, from = 0, size = 20, sort = [{ indexedAt: 'desc' }] }) {
  if (searchBackend === 'memory') {
    return searchIndexMemory(index, { query, filters, from, size });
  }
  const os = getClient();
  const start = Date.now();
  const must = query ? [{ multi_match: { query, fields: ['*'] } }] : [{ match_all: {} }];
  const filter = Object.entries(filters).map(([field, value]) => ({ term: { [field]: value } }));
  const body = {
    from,
    size,
    sort,
    query: { bool: { must, filter } },
    aggs: {
      status_facet: { terms: { field: 'status.keyword', size: 10 } },
      type_facet: { terms: { field: 'type.keyword', size: 10 } }
    }
  };
  try {
    const result = await os.search({ index, body });
    searchMetrics.queries += 1;
    searchMetrics.queryLatencyMs.push(Date.now() - start);
    const hits = result.body.hits.hits.map((h) => ({ id: h._id, score: h._score, ...h._source }));
    const facets = {};
    if (result.body.aggregations) {
      for (const [key, agg] of Object.entries(result.body.aggregations)) {
        facets[key] = agg.buckets;
      }
    }
    return { total: result.body.hits.total.value, hits, facets, took: result.body.took, backend: 'opensearch' };
  } catch (err) {
    console.error(JSON.stringify({
      component: 'opensearch',
      warning: 'search failed; falling back to in-memory index',
      index,
      error: err.message
    }));
    useMemoryBackend();
    return searchIndexMemory(index, { query, filters, from, size });
  }
}

function searchPrometheusMetrics(serviceName) {
  const avgLatency = searchMetrics.queryLatencyMs.length
    ? searchMetrics.queryLatencyMs.reduce((a, b) => a + b, 0) / searchMetrics.queryLatencyMs.length
    : 0;
  return [
    `# HELP search_documents_indexed_total Documents indexed`,
    `# TYPE search_documents_indexed_total counter`,
    `search_documents_indexed_total{service="${serviceName}"} ${searchMetrics.indexed}`,
    `# HELP search_index_failures_total Index failures`,
    `# TYPE search_index_failures_total counter`,
    `search_index_failures_total{service="${serviceName}"} ${searchMetrics.failed}`,
    `# HELP search_queries_total Search queries executed`,
    `# TYPE search_queries_total counter`,
    `search_queries_total{service="${serviceName}"} ${searchMetrics.queries}`,
    `# HELP search_query_latency_ms Average search latency`,
    `# TYPE search_query_latency_ms gauge`,
    `search_query_latency_ms{service="${serviceName}"} ${avgLatency.toFixed(2)}`,
    `# HELP search_backend_info Search backend mode (0=memory,1=opensearch)`,
    `# TYPE search_backend_info gauge`,
    `search_backend_info{service="${serviceName}"} ${searchBackend === 'opensearch' ? 1 : 0}`
  ].join('\n') + '\n';
}

function getSearchBackend() {
  return searchBackend;
}

if (!isOpenSearchConfigured()) {
  useMemoryBackend();
}

module.exports = {
  getClient,
  ensureIndexes,
  indexDocument,
  searchIndex,
  INDEX_DEFINITIONS,
  searchPrometheusMetrics,
  getSearchBackend
};
