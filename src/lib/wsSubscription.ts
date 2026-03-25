import { WSS_URL } from './gql';

export type SubscriptionCallback<T> = (data: T, status: string) => void;
export type UnsubscribeFn = () => void;

let subIdCounter = 1;

/**
 * Subscribe to a Momen async action-flow result via the subscriptions-transport-ws protocol.
 * Returns an unsubscribe function.
 */
export const subscribeToActionFlow = <T = Record<string, unknown>>(
  taskId: number,
  token: string | null,
  onData: SubscriptionCallback<T>,
  onError?: (err: string) => void
): UnsubscribeFn => {
  const ws = new WebSocket(WSS_URL, 'graphql-ws');
  const subId = String(subIdCounter++);
  let closed = false;

  ws.onopen = () => {
    // Step 1: connection_init
    ws.send(JSON.stringify({
      type: 'connection_init',
      payload: token ? { authToken: token } : {},
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'connection_ack') {
      // Step 2: start subscription
      ws.send(JSON.stringify({
        id: subId,
        type: 'start',
        payload: {
          operationName: 'ListenEditResult',
          query: `subscription ListenEditResult($taskId: Long!) {
            fz_listen_action_flow_result(taskId: $taskId) {
              __typename
              output
              status
            }
          }`,
          variables: { taskId },
        },
      }));
    }

    if (msg.type === 'data' && msg.id === subId) {
      const result = msg.payload?.data?.fz_listen_action_flow_result;
      if (result) {
        onData(result as T, result.status);
        if (result.status === 'COMPLETED' || result.status === 'FAILED') {
          ws.send(JSON.stringify({ id: subId, type: 'stop' }));
          ws.close();
        }
      }
    }

    if (msg.type === 'error') {
      onError?.(JSON.stringify(msg.payload));
    }
  };

  ws.onerror = () => {
    if (!closed) onError?.('WebSocket connection error');
  };

  return () => {
    closed = true;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: subId, type: 'stop' }));
      ws.close();
    }
  };
};
