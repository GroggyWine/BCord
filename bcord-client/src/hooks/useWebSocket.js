// =============================================================================
// BeKord WebSocket Hook - Real-time communication
// =============================================================================
// Best practices:
// - Auto-reconnect with exponential backoff
// - Heartbeat to keep connection alive
// - Event-based message handling
// - Connection state management
// - Uses HttpOnly cookie for auth (no token needed in JS)
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = `wss://${window.location.host}/ws`;
const HEARTBEAT_INTERVAL = 25000; // 25 seconds
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  
  // Keep onMessage ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Send a message through WebSocket
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // Subscribe to a server's events
  const subscribeToServer = useCallback((serverId) => {
    return send({ type: 'subscribe_server', server_id: serverId });
  }, [send]);

  // Subscribe to a DM's events
  const subscribeToDm = useCallback((dmId) => {
    return send({ type: 'subscribe_dm', dm_id: dmId });
  }, [send]);

  // Unsubscribe from a server
  const unsubscribeFromServer = useCallback((serverId) => {
    return send({ type: 'unsubscribe_server', server_id: serverId });
  }, [send]);

  // Send typing indicator
  const sendTyping = useCallback((context) => {
    // context: { server_id, channel } or { dm_id }
    return send({ type: 'typing', ...context });
  }, [send]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    setConnectionState('connecting');
    console.log('[WS] Connecting to', WS_URL);

    try {
      // Connect without token - server uses HttpOnly cookie
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected');
        setConnectionState('connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          send({ type: 'ping' });
        }, HEARTBEAT_INTERVAL);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong internally
          if (data.type === 'pong') {
            return;
          }
          
          // Forward other messages to handler
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        setConnectionState('disconnected');
        setIsConnected(false);
        clearTimers();

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current),
            RECONNECT_MAX_DELAY
          );
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WS] Error:', error);
        setConnectionState('error');
      };

    } catch (e) {
      console.error('[WS] Connection failed:', e);
      setConnectionState('error');
    }
  }, [send, clearTimers]);

  // Disconnect
  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    setConnectionState('disconnected');
    setIsConnected(false);
  }, [clearTimers]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionState,
    send,
    subscribeToServer,
    subscribeToDm,
    unsubscribeFromServer,
    sendTyping,
    reconnect: connect,
    disconnect,
  };
}

export default useWebSocket;
