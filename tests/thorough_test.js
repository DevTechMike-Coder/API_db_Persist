import axios from 'axios';

const BASE_URL = 'https://api-db-persist.vercel.app/api';

async function runTests() {
  console.log('🚀 Starting Thorough API Test Suite...\n');

  try {
    // 1. Create/Enrichment Test
    console.log('--- Testing Profile Creation & Enrichment ---');
    const createRes = await axios.post(`${BASE_URL}/profiles`, { name: 'king' });
    console.log('✅ POST /profiles: Status', createRes.status);
    console.log('   Data:', createRes.data.data.name, '| Gender:', createRes.data.data.gender, '| Country:', createRes.data.data.country_id);

    // 2. Pagination & Envelope Test
    console.log('\n--- Testing Pagination & Envelope Structure ---');
    const pagRes = await axios.get(`${BASE_URL}/profiles?page=1&limit=2`);
    const { total_records, current_page, limit, total_pages, data } = pagRes.data;
    if (total_records !== undefined && current_page !== undefined && limit !== undefined && total_pages !== undefined && Array.isArray(data)) {
      console.log('✅ GET /profiles (Pagination): Envelope matches the NEW snake_case structure.');
      console.log(`   Page: ${current_page} | Limit: ${limit} | Total: ${total_records} | Pages: ${total_pages}`);
    } else {
      console.log('❌ GET /profiles (Pagination): Envelope structure is INCORRECT.');
      console.log('   Keys found:', Object.keys(pagRes.data));
    }

    // 3. Limit Cap Test
    console.log('\n--- Testing Limit Capping (Max 50) ---');
    const capRes = await axios.get(`${BASE_URL}/profiles?limit=100`);
    console.log(`✅ GET /profiles?limit=100: Returned limit in meta is ${capRes.data.limit}`);
    if (capRes.data.limit <= 50) {
      console.log('   Capping logic is working.');
    } else {
      console.log('   ❌ Capping logic FAILED.');
    }

    // 4. Sorting Validation Test
    console.log('\n--- Testing Sorting Validation ---');
    try {
      await axios.get(`${BASE_URL}/profiles?sort_by=invalid_field`);
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log('✅ GET /profiles?sort_by=invalid: Returned 400 Bad Request');
        console.log('   Error Envelope:', JSON.stringify(err.response.data));
      } else {
        console.log('❌ GET /profiles?sort_by=invalid: Did not return expected 400.');
      }
    }

    // 5. Natural Language Query (NLQ) Test
    console.log('\n--- Testing Natural Language Query (NLQ) ---');
    const nlqRes = await axios.get(`${BASE_URL}/profiles?q=males`);
    console.log('✅ GET /profiles?q=males: Status', nlqRes.status);
    if (nlqRes.data.data.every(p => p.gender === 'male')) {
      console.log('   All results are male. NLQ is working.');
    } else {
      console.log('   ❌ Some results violated NLQ predicate.');
    }

    // 6. Uninterpretable NLQ Test
    console.log('\n--- Testing Uninterpretable NLQ ---');
    try {
      await axios.get(`${BASE_URL}/profiles?q=asdfghjkl`);
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log('✅ GET /profiles?q=garbage: Returned 400 as expected');
      } else {
        console.log('❌ GET /profiles?q=garbage: Did not return 400.');
      }
    }

    // 7. Combined Filters Test
    console.log('\n--- Testing Combined Filters (NLQ + Manual) ---');
    const combinedRes = await axios.get(`${BASE_URL}/profiles?q=nigeria&gender=female`);
    console.log('✅ GET /profiles?q=nigeria&gender=female: Status', combinedRes.status);
    if (combinedRes.data.data.every(p => p.country_id === 'NG' && p.gender === 'female')) {
      console.log('   Combined logic is working correctly.');
    } else {
      console.log('   ❌ Predicate violation in combined filters.');
    }

    console.log('\n🏁 Test Suite Finished Successfully.');
  } catch (error) {
    console.error('\n💥 Test Suite Failed due to an unexpected error:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data));
    } else {
      console.error('   Message:', error.message);
    }
  }
}

runTests();
