const TOKEN = "6dbd4bf032fe78279a0fd303a0470b3342569db6c58a2aec";
const BASE  = "https://mcht.modon-express.net/v1";

async function testFormat(testName, phoneFormat) {
  const form = new FormData();
  form.append('client_name', 'ايمن هاشم حواس');
  form.append('client_mobile', phoneFormat);
  form.append('city_id', '1');
  form.append('region_id', '1');
  form.append('items_number', '1');
  form.append('price', '5000');
  form.append('type_name', 'طلب جديد');
  form.append('replacement', '0'); 
  form.append('package_size', '1'); 

  try {
    const res = await fetch(`${BASE}/merchant/create-order?token=${TOKEN}`, {
      method: 'POST',
      body: form,
    });
    
    const body = await res.text();
    console.log(`[${testName}] Phone: ${phoneFormat} | HTTP: ${res.status} | Body: ${body}`);
  } catch (error) {
    console.log('Error:', error.message);
  }
}

async function run() {
  console.log("Testing different phone formats...");
  await testFormat('11 Digits', '07835552007');
  await testFormat('With +964', '+9647835552007');
  await testFormat('With 964', '9647835552007');
  await testFormat('With 00964', '009647835552007');
}

run();
