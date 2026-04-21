const TOKEN = "6dbd4bf032fe78279a0fd303a0470b3342569db6c58a2aec";
const BASE  = "https://mcht.modon-express.net/v1";

async function testOrder() {
  const form = new FormData();
  form.append('client_name', 'اختبار تجريبي');
  form.append('client_mobile', '07801234567');
  form.append('city_id', '1');
  form.append('region_id', '1');
  form.append('items_number', '1');
  form.append('price', '5000');
  
  // الحقول المكتشفة
  form.append('type_name', 'ملابس');
  form.append('replacement', '0'); // نوع الطلب: طلب جديد
  form.append('package_size', '1'); // حجم الطلب: عادي

  try {
    console.log("Sending order request to Modon Express...");
    const res = await fetch(`${BASE}/merchant/create-order?token=${TOKEN}`, {
      method: 'POST',
      body: form,
    });
    
    console.log('\nResponse Status:', res.status);
    console.log('Response Body:', await res.text());
  } catch (error) {
    console.log('Error:', error.message);
  }
}

testOrder();
