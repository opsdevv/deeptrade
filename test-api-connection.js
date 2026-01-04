/**
 * Test script for MT5 Accounts API
 * 
 * This script tests the API endpoints to verify:
 * 1. What operations are available
 * 2. What the API allows
 * 3. Response formats
 * 
 * Note: This requires authentication. Run from browser console after logging in.
 */

const API_BASE = '/api/mt5/accounts';

// Test results storage
const testResults = {
  get: null,
  post: null,
  patch: null,
  delete: null,
  errors: []
};

/**
 * Test GET - List accounts
 */
async function testGET() {
  console.log('🧪 Testing GET /api/mt5/accounts...');
  try {
    const response = await fetch(API_BASE);
    const data = await response.json();
    
    testResults.get = {
      status: response.status,
      success: data.success,
      accountCount: data.accounts?.length || 0,
      hasAccounts: Array.isArray(data.accounts),
      response: data
    };
    
    console.log('✅ GET Test Results:', testResults.get);
    return testResults.get;
  } catch (error) {
    testResults.errors.push({ operation: 'GET', error: error.message });
    console.error('❌ GET Test Failed:', error);
    return null;
  }
}

/**
 * Test POST - Create account
 */
async function testPOST() {
  console.log('🧪 Testing POST /api/mt5/accounts...');
  
  const testAccount = {
    account_name: `Test Account ${Date.now()}`,
    broker: 'IC Markets',
    server: 'ICMarkets-Demo',
    login_id: `12345${Math.floor(Math.random() * 10000)}`,
    password: 'test_password_123',
    account_type: 'demo'
  };
  
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testAccount)
    });
    
    const data = await response.json();
    
    testResults.post = {
      status: response.status,
      success: data.success,
      createdAccount: data.account,
      message: data.message,
      response: data
    };
    
    console.log('✅ POST Test Results:', testResults.post);
    
    // Store account ID for later tests
    if (data.account?.id) {
      window.testAccountId = data.account.id;
      console.log('📝 Stored account ID for later tests:', window.testAccountId);
    }
    
    return testResults.post;
  } catch (error) {
    testResults.errors.push({ operation: 'POST', error: error.message });
    console.error('❌ POST Test Failed:', error);
    return null;
  }
}

/**
 * Test PATCH - Select account
 */
async function testPATCH(accountId) {
  console.log('🧪 Testing PATCH /api/mt5/accounts...');
  
  if (!accountId) {
    console.warn('⚠️ No account ID provided. Skipping PATCH test.');
    return null;
  }
  
  try {
    const response = await fetch(API_BASE, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account_id: accountId })
    });
    
    const data = await response.json();
    
    testResults.patch = {
      status: response.status,
      success: data.success,
      selectedAccount: data.account,
      message: data.message,
      response: data
    };
    
    console.log('✅ PATCH Test Results:', testResults.patch);
    return testResults.patch;
  } catch (error) {
    testResults.errors.push({ operation: 'PATCH', error: error.message });
    console.error('❌ PATCH Test Failed:', error);
    return null;
  }
}

/**
 * Test DELETE - Remove account
 */
async function testDELETE(accountId) {
  console.log('🧪 Testing DELETE /api/mt5/accounts...');
  
  if (!accountId) {
    console.warn('⚠️ No account ID provided. Skipping DELETE test.');
    return null;
  }
  
  try {
    const response = await fetch(`${API_BASE}?account_id=${accountId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    testResults.delete = {
      status: response.status,
      success: data.success,
      message: data.message,
      response: data
    };
    
    console.log('✅ DELETE Test Results:', testResults.delete);
    return testResults.delete;
  } catch (error) {
    testResults.errors.push({ operation: 'DELETE', error: error.message });
    console.error('❌ DELETE Test Failed:', error);
    return null;
  }
}

/**
 * Test invalid requests
 */
async function testInvalidRequests() {
  console.log('🧪 Testing invalid requests...');
  
  const invalidTests = [];
  
  // Test POST without required fields
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: 'Test' }) // Missing required fields
    });
    const data = await response.json();
    invalidTests.push({
      test: 'POST without required fields',
      status: response.status,
      expectedError: true,
      hasError: !!data.error,
      error: data.error
    });
  } catch (error) {
    invalidTests.push({ test: 'POST without required fields', error: error.message });
  }
  
  // Test PATCH without account_id
  try {
    const response = await fetch(API_BASE, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing account_id
    });
    const data = await response.json();
    invalidTests.push({
      test: 'PATCH without account_id',
      status: response.status,
      expectedError: true,
      hasError: !!data.error,
      error: data.error
    });
  } catch (error) {
    invalidTests.push({ test: 'PATCH without account_id', error: error.message });
  }
  
  // Test DELETE without account_id
  try {
    const response = await fetch(API_BASE, {
      method: 'DELETE'
    });
    const data = await response.json();
    invalidTests.push({
      test: 'DELETE without account_id',
      status: response.status,
      expectedError: true,
      hasError: !!data.error,
      error: data.error
    });
  } catch (error) {
    invalidTests.push({ test: 'DELETE without account_id', error: error.message });
  }
  
  console.log('✅ Invalid Request Tests:', invalidTests);
  return invalidTests;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting MT5 API Tests...\n');
  
  // Test GET
  await testGET();
  
  // Test POST (create account)
  const postResult = await testPOST();
  const accountId = postResult?.createdAccount?.id || window.testAccountId;
  
  // Test PATCH (select account)
  await testPATCH(accountId);
  
  // Test invalid requests
  await testInvalidRequests();
  
  // Test DELETE (cleanup - comment out if you want to keep the test account)
  // await testDELETE(accountId);
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log('================');
  console.log('GET:', testResults.get?.success ? '✅' : '❌');
  console.log('POST:', testResults.post?.success ? '✅' : '❌');
  console.log('PATCH:', testResults.patch?.success ? '✅' : '❌');
  console.log('DELETE:', testResults.delete?.success ? '✅' : '⚠️ (skipped)');
  console.log('Errors:', testResults.errors.length);
  
  console.log('\n📋 Full Results:', testResults);
  
  return testResults;
}

// Export for use
if (typeof window !== 'undefined') {
  window.testMT5API = {
    runAllTests,
    testGET,
    testPOST,
    testPATCH,
    testDELETE,
    testInvalidRequests,
    results: testResults
  };
  
  console.log('✅ Test functions loaded! Run window.testMT5API.runAllTests() to test the API');
}

// Auto-run if in Node.js environment (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testGET,
    testPOST,
    testPATCH,
    testDELETE,
    testInvalidRequests
  };
}
