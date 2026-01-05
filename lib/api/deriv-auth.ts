// Deriv Authentication - Login with username and password

import WebSocket from 'ws';

const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3';
const DERIV_APP_ID = process.env.DERIV_APP_ID || '1089'; // Default test app ID

export interface LoginParams {
  login: string;
  password: string;
  server?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  account_id?: string;
  balance?: number;
  currency?: string;
  email?: string;
  country?: string;
  landing_company_name?: string;
  landing_company_shortcode?: string;
}

/**
 * Login to Deriv account using username and password
 * Returns account information if successful
 */
export async function loginToDerivAccount(
  params: LoginParams
): Promise<LoginResult> {
  const { login, password, server } = params;

  if (!login || !password) {
    return {
      success: false,
      error: 'Login and password are required',
    };
  }

  try {
    // Create WebSocket connection
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${DERIV_WS_URL}?app_id=${DERIV_APP_ID}`);
    } catch (wsError: any) {
      return {
        success: false,
        error: `Failed to create WebSocket: ${wsError.message}`,
      };
    }
    let requestId = 1;
    const authReqId = requestId++;

    return new Promise((resolve, reject) => {
      let isResolved = false;
      const timeout = setTimeout(() => {
        if (!isResolved) {
          ws.close();
          isResolved = true;
          reject(new Error('Login request timeout'));
        }
      }, 15000);

      ws.on('open', () => {
        // Format auth token as "login:password"
        const authToken = `${login}:${password}`;
        
        // Send authorize request
        ws.send(JSON.stringify({
          authorize: authToken,
          req_id: authReqId,
        }));
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.req_id === authReqId) {
            if (isResolved) {
              return;
            }
            clearTimeout(timeout);
            isResolved = true;
            ws.close();

            if (message.error) {
              resolve({
                success: false,
                error: message.error.message || 'Authentication failed',
              });
            } else if (message.authorize) {
              const authData = message.authorize;
              resolve({
                success: true,
                account_id: authData.loginid || authData.account_id || login,
                balance: authData.balance !== undefined && authData.balance !== null 
                  ? parseFloat(String(authData.balance)) 
                  : undefined,
                currency: authData.currency || 'USD',
                email: authData.email,
                country: authData.country,
                landing_company_name: authData.landing_company_name,
                landing_company_shortcode: authData.landing_company_shortcode,
              });
            } else {
              resolve({
                success: false,
                error: 'Unexpected response format',
              });
            }
          }
        } catch (error: any) {
          if (!isResolved) {
            clearTimeout(timeout);
            isResolved = true;
            ws.close();
            resolve({
              success: false,
              error: `Failed to parse response: ${error.message}`,
            });
          }
        }
      });

      ws.on('error', (error) => {
        if (!isResolved) {
          clearTimeout(timeout);
          isResolved = true;
          resolve({
            success: false,
            error: `WebSocket error: ${error.message}`,
          });
        }
      });

      ws.on('close', () => {
        if (!isResolved) {
          clearTimeout(timeout);
        }
      });
    });
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to connect: ${error.message}`,
    };
  }
}
