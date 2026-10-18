// JSON Schema 부분집합 검증. 모델에 보내는 구조화 출력 스키마를 서버에서 그대로 다시 검사한다.
// Gemini가 받는 키워드만 쓴다: type(배열로 null 허용), properties, required, enum, items, minItems, maxItems,
// minimum, maximum, description. https://ai.google.dev/gemini-api/docs/structured-output

export type JsonSchema = {
  type: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: (string | number)[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

export function validateSchema(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = typeOf(value);
  const ok = types.includes(actual) || (actual === 'integer' && types.includes('number'));
  if (!ok) return [`${path}: ${types.join('|')} 이어야 하는데 ${actual}`];
  if (actual === 'null') return [];
  const errs: string[] = [];
  if (schema.enum && !schema.enum.includes(value as string | number)) errs.push(`${path}: 허용값 아님 (${String(value)})`);
  if (actual === 'integer' || actual === 'number') {
    const n = value as number;
    if (schema.minimum !== undefined && n < schema.minimum) errs.push(`${path}: ${schema.minimum} 이상`);
    if (schema.maximum !== undefined && n > schema.maximum) errs.push(`${path}: ${schema.maximum} 이하`);
  }
  if (actual === 'array') {
    const arr = value as unknown[];
    if (schema.minItems !== undefined && arr.length < schema.minItems) errs.push(`${path}: 최소 ${schema.minItems}개`);
    if (schema.maxItems !== undefined && arr.length > schema.maxItems) errs.push(`${path}: 최대 ${schema.maxItems}개`);
    if (schema.items) arr.forEach((x, i) => errs.push(...validateSchema(schema.items!, x, `${path}[${i}]`)));
  }
  if (actual === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) errs.push(`${path}.${k}: 없음`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in obj) errs.push(...validateSchema(sub, obj[k], `${path}.${k}`));
    }
  }
  return errs;
}

// 스키마를 짧게 쓰기 위한 도우미.
export const S = {
  str: (description?: string): JsonSchema => ({ type: 'string', ...(description ? { description } : {}) }),
  strOrNull: (description?: string): JsonSchema => ({ type: ['string', 'null'], ...(description ? { description } : {}) }),
  bool: (description?: string): JsonSchema => ({ type: 'boolean', ...(description ? { description } : {}) }),
  int: (min?: number, max?: number): JsonSchema => ({
    type: 'integer',
    ...(min !== undefined ? { minimum: min } : {}),
    ...(max !== undefined ? { maximum: max } : {}),
  }),
  enum: (values: string[], description?: string): JsonSchema => ({ type: 'string', enum: values, ...(description ? { description } : {}) }),
  arr: (items: JsonSchema, min?: number, max?: number, description?: string): JsonSchema => ({
    type: 'array',
    items,
    ...(min !== undefined ? { minItems: min } : {}),
    ...(max !== undefined ? { maxItems: max } : {}),
    ...(description ? { description } : {}),
  }),
  obj: (properties: Record<string, JsonSchema>, nullable = false, description?: string): JsonSchema => ({
    type: nullable ? ['object', 'null'] : 'object',
    properties,
    required: Object.keys(properties),
    ...(description ? { description } : {}),
  }),
};
