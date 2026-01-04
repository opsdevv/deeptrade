# MT5 Accounts API Test Documentation

## API Endpoint: `/api/mt5/accounts`

### Overview
The MT5 Accounts API is a CRUD (Create, Read, Update, Delete) interface for managing MT5 trading account credentials. It stores account information in Supabase but **does NOT validate credentials or connect to MT5 servers**.

### Available Operations

#### 1. GET - List All MT5 Accounts
**Endpoint:** `GET /api/mt5/accounts`

**Authentication:** Required (Supabase session cookie)

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "id": "uuid",
      "account_name": "My MT5 Account",
      "broker": "IC Markets",
      "server": "ICMarkets-Demo",
      "login_id": "12345678",
      "account_type": "demo",
      "account_id": "12345678",
      "balance": 10000.00,
      "currency": "USD",
      "is_active": true,
      "is_selected": false,
      "last_login_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**What it does:**
- Fetches all MT5 accounts for the authenticated user
- Returns accounts ordered by creation date (newest first)
- Does NOT connect to MT5 servers
- Does NOT validate credentials

---

#### 2. POST - Create or Update MT5 Account
**Endpoint:** `POST /api/mt5/accounts`

**Authentication:** Required (Supabase session cookie)

**Request Body:**
```json
{
  "account_name": "My MT5 Account",
  "broker": "IC Markets",
  "server": "ICMarkets-Demo",
  "login_id": "12345678",
  "password": "your_password",
  "account_type": "demo",  // or "real"
  "account_id": "uuid"    // Optional: include to update existing account
}
```

**Required Fields:**
- `account_name` - User-friendly name
- `broker` - Broker name (e.g., "IC Markets", "FXTM")
- `server` - MT5 server name
- `login_id` - MT5 account login ID
- `account_type` - Must be "real" or "demo"

**Optional Fields:**
- `password` - Required for new accounts, optional for updates
- `account_id` - Include to update existing account

**Response (Create):**
```json
{
  "success": true,
  "account": { /* account object */ },
  "message": "MT5 account added successfully"
}
```

**Response (Update):**
```json
{
  "success": true,
  "account": { /* updated account object */ },
  "message": "MT5 account updated successfully"
}
```

**What it does:**
- Creates a new MT5 account record in the database
- Sets the new account as `is_selected: true` (unselects others)
- Updates `last_login_at` timestamp
- Stores password in plain text (⚠️ **NOT ENCRYPTED** - see security note)
- Does NOT validate credentials with MT5 server
- Does NOT connect to MT5 server
- Sets `account_id` to the same value as `login_id`

**Security Note:** ⚠️ Passwords are stored in plain text. In production, you should:
- Encrypt passwords before storing
- Use environment variables for encryption keys
- Consider using Supabase Vault or similar secure storage

---

#### 3. PATCH - Select/Activate MT5 Account
**Endpoint:** `PATCH /api/mt5/accounts`

**Authentication:** Required (Supabase session cookie)

**Request Body:**
```json
{
  "account_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "account": { /* selected account object */ },
  "message": "Account selected successfully"
}
```

**What it does:**
- Sets `is_selected: false` for all user's MT5 accounts
- Sets `is_selected: true` for the specified account
- Used to switch between multiple MT5 accounts

---

#### 4. DELETE - Remove MT5 Account
**Endpoint:** `DELETE /api/mt5/accounts?account_id=uuid`

**Authentication:** Required (Supabase session cookie)

**Query Parameters:**
- `account_id` (required) - UUID of the account to delete

**Response:**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**What it does:**
- Permanently deletes the MT5 account record from the database
- Only deletes accounts belonging to the authenticated user

---

## Limitations & Missing Features

### ❌ What the API Does NOT Do:
1. **No MT5 Server Connection** - Does not connect to MT5 servers
2. **No Credential Validation** - Does not verify login credentials
3. **No Balance Fetching** - Does not fetch real-time balance from MT5
4. **No Trading Operations** - Cannot place orders, check positions, etc.
5. **No Password Encryption** - Stores passwords in plain text

### ✅ What the API Does:
1. **CRUD Operations** - Create, read, update, delete account records
2. **Account Selection** - Mark one account as active/selected
3. **User Isolation** - Only shows/manages accounts for authenticated user
4. **Data Storage** - Stores account metadata in Supabase database

---

## Comparison with Deriv API

| Feature | Deriv API (`/api/deriv/auth`) | MT5 API (`/api/mt5/accounts`) |
|---------|------------------------------|-------------------------------|
| Credential Validation | ✅ Yes (validates with Deriv) | ❌ No |
| Server Connection | ✅ Yes (WebSocket) | ❌ No |
| Balance Fetching | ✅ Yes (from Deriv) | ❌ No |
| Password Encryption | ⚠️ Plain text | ⚠️ Plain text |
| Account Selection | ✅ Yes | ✅ Yes |
| CRUD Operations | ✅ Yes | ✅ Yes |

---

## Testing the API

### Prerequisites:
1. Next.js dev server running (`npm run dev`)
2. Authenticated session (login via `/login` page)
3. Supabase configured with `mt5_accounts` table

### Test with cURL:

```bash
# 1. GET - List accounts (requires auth cookie)
curl -X GET http://localhost:3000/api/mt5/accounts \
  -H "Cookie: your-supabase-session-cookie"

# 2. POST - Create account (requires auth cookie)
curl -X POST http://localhost:3000/api/mt5/accounts \
  -H "Content-Type: application/json" \
  -H "Cookie: your-supabase-session-cookie" \
  -d '{
    "account_name": "Test MT5 Account",
    "broker": "IC Markets",
    "server": "ICMarkets-Demo",
    "login_id": "12345678",
    "password": "test123",
    "account_type": "demo"
  }'

# 3. PATCH - Select account (requires auth cookie)
curl -X PATCH http://localhost:3000/api/mt5/accounts \
  -H "Content-Type: application/json" \
  -H "Cookie: your-supabase-session-cookie" \
  -d '{
    "account_id": "account-uuid-here"
  }'

# 4. DELETE - Delete account (requires auth cookie)
curl -X DELETE "http://localhost:3000/api/mt5/accounts?account_id=account-uuid-here" \
  -H "Cookie: your-supabase-session-cookie"
```

### Test via Browser Console:

```javascript
// 1. List accounts
fetch('/api/mt5/accounts')
  .then(r => r.json())
  .then(console.log);

// 2. Create account
fetch('/api/mt5/accounts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    account_name: 'Test Account',
    broker: 'IC Markets',
    server: 'ICMarkets-Demo',
    login_id: '12345678',
    password: 'test123',
    account_type: 'demo'
  })
})
  .then(r => r.json())
  .then(console.log);

// 3. Select account
fetch('/api/mt5/accounts', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    account_id: 'account-uuid-here'
  })
})
  .then(r => r.json())
  .then(console.log);

// 4. Delete account
fetch('/api/mt5/accounts?account_id=account-uuid-here', {
  method: 'DELETE'
})
  .then(r => r.json())
  .then(console.log);
```

---

## Recommendations

### To Make This Production-Ready:

1. **Add MT5 Connection Library**
   - Install an MT5 API library (e.g., `node-mt5-api` or similar)
   - Validate credentials when creating/updating accounts
   - Fetch real balance from MT5 server

2. **Encrypt Passwords**
   - Use `crypto` module or a library like `bcrypt`
   - Store encrypted passwords only
   - Never return passwords in API responses

3. **Add Error Handling**
   - Handle MT5 connection errors
   - Validate server names against known MT5 servers
   - Provide better error messages

4. **Add Balance Sync**
   - Periodically fetch balance from MT5
   - Update balance in database
   - Show last sync timestamp

5. **Add Trading Operations**
   - Place orders
   - Check positions
   - Get account info
   - Monitor trades
