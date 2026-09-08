const crypto = require('crypto');
const https = require('https');

const SUPABASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '<SERVICE_ROLE_KEY_REDACTED>';
const EMAIL = process.argv[2] || 'ferramentas@aliancadealtovalor.com.br';

function generatePassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];
  const rest = Array.from({ length: 12 }, () => all[crypto.randomInt(all.length)]);
  return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('');
}

async function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'qzesffnkqgelmtfblzkr.supabase.co',
      path: '/auth/v1/admin/users?email=' + encodeURIComponent(email),
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'apikey': SERVICE_KEY,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function updateUserPassword(userId, password) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ password });
    const options = {
      hostname: 'qzesffnkqgelmtfblzkr.supabase.co',
      path: '/auth/v1/admin/users/' + userId,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Buscando usuario:', EMAIL);
  const listResult = await getUserByEmail(EMAIL);
  console.log('Status busca:', listResult.status);

  if (listResult.status !== 200) {
    console.error('Erro ao buscar usuarios:', JSON.stringify(listResult.body, null, 2));
    process.exit(1);
  }

  const users = listResult.body.users || [];
  const user = users.find((u) => u.email === EMAIL);

  if (!user) {
    console.error('Usuario nao encontrado:', EMAIL);
    process.exit(1);
  }

  console.log('Usuario encontrado. ID:', user.id);

  const newPassword = generatePassword();
  console.log('Definindo nova senha...');

  const updateResult = await updateUserPassword(user.id, newPassword);
  console.log('Status update:', updateResult.status);

  if (updateResult.status === 200) {
    console.log('\n=== SUCESSO ===');
    console.log('Email:', EMAIL);
    console.log('Nova senha:', newPassword);
    console.log('===============\n');
  } else {
    console.error('Erro ao atualizar senha:', JSON.stringify(updateResult.body, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
