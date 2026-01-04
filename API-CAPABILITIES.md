# MT5 Accounts API - Capabilities & Limitations

## ✅ What the API ALLOWS

### 1. **Account Management (CRUD Operations)**

#### ✅ CREATE Account
- **Endpoint:** `POST /api/mt5/accounts`
- **Allows:**
  - Store MT5 account credentials (broker, server, login, password)
  - Set account as selected by default
  - Store account metadata (name, type, currency)
  - Track creation timestamp

#### ✅ READ Accounts
- **Endpoint:** `GET /api/mt5/accounts`
- **Allows:**
  - List all MT5 accounts for authenticated user
  - View account details (name, broker, server, login, type, balance, currency)
  - See which account is currently selected
  - View last login timestamp

#### ✅ UPDATE Account
- **Endpoint:** `POST /api/mt5/accounts` (with `account_id` in body)
- **Allows:**
  - Update account name, broker, server
  - Update login ID
  - Update password (optional - can leave blank to keep existing)
  - Update account type (real/demo)
  - Update last login timestamp

#### ✅ DELETE Account
- **Endpoint:** `DELETE /api/mt5/accounts?account_id=uuid`
- **Allows:**
  - Remove MT5 account from database
  - Only delete accounts belonging to authenticated user

### 2. **Account Selection**

#### ✅ SELECT/ACTIVATE Account
- **Endpoint:** `PATCH /api/mt5/accounts`
- **Allows:**
  - Mark one account as active/selected
  - Automatically unselects all other accounts
  - Switch between multiple MT5 accounts

### 3. **Data Storage**

#### ✅ Database Operations
- **Allows:**
  - Store account credentials in Supabase PostgreSQL
  - User isolation (each user only sees their own accounts)
  - Track account status (active/inactive, selected/unselected)
  - Store balance and currency information
  - Track timestamps (created_at, last_login_at)

### 4. **Authentication & Authorization**

#### ✅ User Authentication
- **Allows:**
  - Requires Supabase session authentication
  - Validates user identity before operations
  - Prevents unauthorized access to other users' accounts

---

## ❌ What the API DOES NOT Allow

### 1. **MT5 Server Connection**
- ❌ **Cannot connect to MT5 servers**
- ❌ **Cannot validate credentials with MT5 broker**
- ❌ **Cannot verify if account exists on MT5 server**
- ❌ **Cannot check if server name is valid**

### 2. **Real-time Data Fetching**
- ❌ **Cannot fetch balance from MT5 server**
- ❌ **Cannot get account information from MT5**
- ❌ **Cannot check account status (active/suspended)**
- ❌ **Cannot verify login credentials**

### 3. **Trading Operations**
- ❌ **Cannot place orders**
- ❌ **Cannot check open positions**
- ❌ **Cannot view trade history**
- ❌ **Cannot modify orders**
- ❌ **Cannot close positions**

### 4. **Security Features**
- ❌ **Does NOT encrypt passwords** (stored in plain text)
- ❌ **Does NOT validate password strength**
- ❌ **Does NOT mask passwords in responses** (should be removed from API responses)

### 5. **Advanced Features**
- ❌ **Cannot sync balance automatically**
- ❌ **Cannot test connection to MT5 server**
- ❌ **Cannot validate server/broker names**
- ❌ **Cannot fetch account settings from MT5**

---

## 📋 API Request/Response Examples

### GET - List Accounts
```http
GET /api/mt5/accounts
Cookie: sb-xxx-auth-token=...

Response 200:
{
  "success": true,
  "accounts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "account_name": "IC Markets Demo",
      "broker": "IC Markets",
      "server": "ICMarkets-Demo",
      "login_id": "12345678",
      "account_type": "demo",
      "account_id": "12345678",
      "balance": null,
      "currency": "USD",
      "is_active": true,
      "is_selected": true,
      "last_login_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### POST - Create Account
```http
POST /api/mt5/accounts
Content-Type: application/json
Cookie: sb-xxx-auth-token=...

Request:
{
  "account_name": "FXTM Real Account",
  "broker": "FXTM",
  "server": "FXTM-Demo",
  "login_id": "87654321",
  "password": "my_password",
  "account_type": "demo"
}

Response 200:
{
  "success": true,
  "account": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "account_name": "FXTM Real Account",
    "broker": "FXTM",
    "server": "FXTM-Demo",
    "login_id": "87654321",
    "account_type": "demo",
    "account_id": "87654321",
    "balance": null,
    "currency": "USD",
    "is_active": true,
    "is_selected": true,
    "last_login_at": "2024-01-15T11:00:00Z",
    "created_at": "2024-01-15T11:00:00Z"
  },
  "message": "MT5 account added successfully"
}
```

### PATCH - Select Account
```http
PATCH /api/mt5/accounts
Content-Type: application/json
Cookie: sb-xxx-auth-token=...

Request:
{
  "account_id": "550e8400-e29b-41d4-a716-446655440000"
}

Response 200:
{
  "success": true,
  "account": { /* account object */ },
  "message": "Account selected successfully"
}
```

### DELETE - Remove Account
```http
DELETE /api/mt5/accounts?account_id=550e8400-e29b-41d4-a716-446655440000
Cookie: sb-xxx-auth-token=...

Response 200:
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

## 🔒 Security Considerations

### Current Security Status: ⚠️ **NOT PRODUCTION READY**

1. **Password Storage:**
   - ⚠️ Passwords stored in **plain text** in database
   - ⚠️ No encryption applied
   - ⚠️ Passwords may be returned in API responses (should be excluded)

2. **Credential Validation:**
   - ⚠️ No validation of credentials with MT5 server
   - ⚠️ Invalid credentials can be stored
   - ⚠️ No verification of server/broker names

3. **What Should Be Done:**
   - ✅ Encrypt passwords before storing (use `crypto` or `bcrypt`)
   - ✅ Never return passwords in API responses
   - ✅ Add credential validation with MT5 server
   - ✅ Use environment variables for encryption keys
   - ✅ Consider using Supabase Vault for sensitive data

---

## 🚀 Recommendations for Enhancement

### Priority 1: Security
1. **Encrypt passwords** before storing
2. **Remove passwords** from API responses
3. **Add input validation** for server/broker names

### Priority 2: Functionality
1. **Add MT5 connection library** to validate credentials
2. **Implement balance fetching** from MT5 server
3. **Add connection testing** endpoint

### Priority 3: User Experience
1. **Add balance sync** functionality
2. **Show connection status** (connected/disconnected)
3. **Add error messages** for invalid credentials
4. **Implement account verification** before saving

### Priority 4: Trading Features
1. **Add trading operations** (place orders, check positions)
2. **Implement trade history** viewing
3. **Add real-time account monitoring**

---

## 📊 API Capability Matrix

| Feature | Supported | Notes |
|---------|-----------|-------|
| Create Account | ✅ Yes | Stores credentials, no validation |
| Read Accounts | ✅ Yes | Lists all user accounts |
| Update Account | ✅ Yes | Can update all fields except ID |
| Delete Account | ✅ Yes | Permanent deletion |
| Select Account | ✅ Yes | Mark one as active |
| Validate Credentials | ❌ No | No MT5 connection |
| Fetch Balance | ❌ No | No MT5 connection |
| Place Orders | ❌ No | No trading API |
| Check Positions | ❌ No | No trading API |
| Encrypt Passwords | ❌ No | Stored in plain text |
| Test Connection | ❌ No | No MT5 connection |

---

## 🧪 Testing

To test the API capabilities:

1. **Open browser console** on your app (after logging in)
2. **Load the test script:**
   ```javascript
   // Copy and paste test-api-connection.js content
   ```
3. **Run tests:**
   ```javascript
   window.testMT5API.runAllTests()
   ```

Or use the test file: `test-api-connection.js`

---

## 📝 Summary

The MT5 Accounts API is a **basic CRUD interface** for storing MT5 account credentials. It provides:
- ✅ Full CRUD operations
- ✅ Account selection/activation
- ✅ User isolation and authentication

But it **does NOT**:
- ❌ Connect to MT5 servers
- ❌ Validate credentials
- ❌ Fetch real-time data
- ❌ Support trading operations
- ❌ Encrypt sensitive data

**Current Status:** Ready for credential storage, but needs MT5 connection library and security enhancements for production use.
