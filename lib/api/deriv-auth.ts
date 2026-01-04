// Deriv Account Authentication - Login with credentials

import WebSocket from 'ws';

const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3';
const DERIV_APP_ID = process.env.DERIV_APP_ID || '1089';

interface LoginCredentials {
  login: string;
  password: string;
  server: string;
}

interface LoginResponse {
  success: boolean;
  account_id?: string;
  balance?: number;
  currency?: string;
  email?: string;
  error?: string;
}

/**
 * Login to Deriv account using credentials
 */
export async function loginToDerivAccount(
  credentials: LoginCredentials
): Promise<LoginResponse> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
    let requestId = 1;
    const reqId = requestId++;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Login timeout'));
    }, 10000);

    ws.on('open', () => {
      // For Deriv, we use the format: "login:password" or just the token
      // If server is specified, we might need to use it in the connection URL or request
      const loginRequest = {
        authorize: `${credentials.login}:${credentials.password}`,
        req_id: reqId,
      };

      ws.send(JSON.stringify(loginRequest));
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.req_id === reqId) {
          clearTimeout(timeout);
          ws.close();

          if (message.error) {
            resolve({
              success: false,
              error: message.error.message || 'Login failed',
            });
          } else if (message.authorize) {
            const auth = message.authorize;
            resolve({
              success: true,
              account_id: auth.account_id || credentials.login,
              balance: auth.balance ? parseFloat(auth.balance) : undefined,
              currency: auth.currency || 'USD',
              email: auth.email,
            });
          } else {
            resolve({
              success: false,
              error: 'Unexpected response format',
            });
          }
        }
      } catch (error: any) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`Failed to parse response: ${error.message}`));
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message}`));
    });
  });
}

/**
 * Get account balance and info
 */
export async function getAccountInfo(authToken: string): Promise<{
  account_id?: string;
  balance?: number;
  currency?: string;
  email?: string;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
    let requestId = 1;
    const authReqId = requestId++;
    const accountInfoReqId = requestId++;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Request timeout'));
    }, 10000);

    ws.on('open', () => {
      // First authorize with the auth token
      ws.send(JSON.stringify({
        authorize: authToken,
        req_id: authReqId,
      }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.req_id === authReqId) {
          if (message.error) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(message.error.message || 'Authorization failed'));
          } else if (message.authorize) {
            // Get account info after successful authorization
            ws.send(JSON.stringify({
              get_account_status: 1,
              req_id: accountInfoReqId,
            }));
          }
        } else if (message.req_id === accountInfoReqId) {
          clearTimeout(timeout);
          ws.close();

          if (message.error) {
            reject(new Error(message.error.message || 'Failed to get account info'));
          } else {
            resolve({
              account_id: message.get_account_status?.loginid,
              balance: message.get_account_status?.balance ? parseFloat(message.get_account_status.balance) : undefined,
              currency: message.get_account_status?.currency || 'USD',
            });
          }
        }
      } catch (error: any) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`Failed to parse response: ${error.message}`));
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message}`));
    });
  });
}
