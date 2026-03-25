const PROJECT_EX_ID = '6oZnxYOYrgr';
export const HTTP_URL = `https://villa.momen.app/zero/${PROJECT_EX_ID}/api/graphql-v2`;
export const WSS_URL = `wss://villa.momen.app/zero/${PROJECT_EX_ID}/api/graphql-subscription`;

export class GqlError extends Error {
  constructor(public errors: { message: string }[]) {
    super(errors[0]?.message ?? 'GraphQL error');
  }
}

export const gqlRequest = async <T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string | null
): Promise<T> => {
  const res = await fetch(HTTP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new GqlError(json.errors);
  return json.data as T;
};
