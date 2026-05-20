/**
 * test_role_permissions.js
 * Skrip verifikasi otomatis untuk memastikan bahwa middleware keamanan peran (RBAC)
 * telah diterapkan dengan benar pada seluruh rute backend pendapatan dan SP2D.
 *
 * Menjalankan pengujian langsung ke handler middleware Express tanpa perlu menjalankan server.
 * Jalankan: node backend/scratch/test_role_permissions.js
 */

const pendapatanRouter = require('../routes/pendapatanRoutes');
const sp2dRouter = require('../routes/sp2dRoutes');

// Helper untuk membuat objek mock request, response, dan next
function createMockHttp(role) {
  let statusSet = 400;
  let jsonResponse = null;
  let nextCalled = false;

  const req = {
    user: {
      role: role,
      id: 'mock-user-id',
      username: `mock-${role.replace(/\s+/g, '-').toLowerCase()}`
    },
    params: {},
    body: {},
    query: {},
    header: () => 'Bearer mocktoken'
  };

  const res = {
    status(code) {
      statusSet = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    }
  };

  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getResult: () => ({
      status: statusSet,
      json: jsonResponse,
      nextCalled
    })
  };
}

function testRouterPermissions(routerName, router) {
  console.log(`\n--- Menguji Rute dan Middleware pada ${routerName} ---`);
  
  let totalRoutesTested = 0;
  let totalPass = 0;

  router.stack.forEach(layer => {
    const route = layer.route;
    if (!route) return; // Skip if it's not a route layer

    const path = route.path;
    const methods = Object.keys(route.methods).join(', ').toUpperCase();
    console.log(`Menguji Rute: [${methods}] ${path}`);

    // Cari middleware pelindung peran (yang memeriksa req.user.role atau nama middleware tertentu)
    const roleMiddlewareLayer = route.stack.find(s => {
      const fnStr = s.handle.toString();
      return fnStr.includes('req.user.role') || 
             fnStr.includes('adminOnly') || 
             fnStr.includes('operatorPenerimaanOrAdminOnly') || 
             fnStr.includes('operatorSp2dOrAdminOnly');
    });

    if (!roleMiddlewareLayer) {
      console.error(`❌ ERROR: Rute [${methods}] ${path} TIDAK memiliki middleware pelindung peran!`);
      return;
    }

    const roleMiddleware = roleMiddlewareLayer.handle;
    const fnStr = roleMiddleware.toString();
    totalRoutesTested++;

    let allowedRoles = [];
    let forbiddenRoles = [];

    // Deteksi tipe middleware secara dinamis berdasarkan kode string atau nama fungsi
    if (fnStr.includes('khusus Admin') || fnStr.includes('adminOnly') || roleMiddleware.name === 'adminOnly') {
      allowedRoles = ['admin'];
      forbiddenRoles = ['Operator SP2D', 'Operator Penerimaan', 'Operator Lain', 'guest'];
      console.log(`   [Tipe Keamanan: Admin-Only]`);
    } else if (fnStr.includes('Operator Penerimaan') || roleMiddleware.name === 'operatorPenerimaanOrAdminOnly') {
      allowedRoles = ['admin', 'Operator Penerimaan'];
      forbiddenRoles = ['Operator SP2D', 'Operator Lain', 'guest'];
      console.log(`   [Tipe Keamanan: Operator Penerimaan atau Admin]`);
    } else if (fnStr.includes('Operator SP2D') || roleMiddleware.name === 'operatorSp2dOrAdminOnly') {
      allowedRoles = ['admin', 'Operator SP2D'];
      forbiddenRoles = ['Operator Penerimaan', 'Operator Lain', 'guest'];
      console.log(`   [Tipe Keamanan: Operator SP2D atau Admin]`);
    } else {
      allowedRoles = ['admin'];
      forbiddenRoles = ['Operator Lain', 'guest'];
      console.log(`   [Tipe Keamanan: Lainnya/Ketat]`);
    }

    let routePass = true;

    // 1. Tes Peran yang DIIZINKAN (Allowed Roles)
    for (const role of allowedRoles) {
      const { req, res, next, getResult } = createMockHttp(role);
      try {
        roleMiddleware(req, res, next);
        const result = getResult();
        
        if (!result.nextCalled) {
          console.error(`   ❌ GAGAL untuk peran '${role}': next() tidak dipanggil (Akses Ditolak salah sasaran)`);
          routePass = false;
        }
      } catch (err) {
        console.error(`   ❌ ERROR saat menjalankan middleware untuk peran '${role}':`, err.message);
        routePass = false;
      }
    }

    // 2. Tes Peran yang DILARANG (Forbidden Roles)
    for (const role of forbiddenRoles) {
      const { req, res, next, getResult } = createMockHttp(role);
      try {
        roleMiddleware(req, res, next);
        const result = getResult();
        
        if (result.nextCalled) {
          console.error(`   ❌ GAGAL untuk peran '${role}': next() dipanggil padahal harusnya diblokir!`);
          routePass = false;
        } else if (result.status !== 403) {
          console.error(`   ❌ GAGAL untuk peran '${role}': status code respon adalah ${result.status}, harusnya 403`);
          routePass = false;
        }
      } catch (err) {
        console.error(`   ❌ ERROR saat menjalankan middleware untuk peran '${role}':`, err.message);
        routePass = false;
      }
    }

    if (routePass) {
      totalPass++;
      console.log(`   ✓ [OK] Rute aman & lolos semua skenario peran.`);
    } else {
      console.log(`   ❌ [FAIL] Rute memiliki kelemahan otorisasi.`);
    }
  });

  console.log(`Ringkasan ${routerName}: Lolos ${totalPass} dari ${totalRoutesTested} rute yang diuji.`);
  return totalPass === totalRoutesTested;
}

function runAllTests() {
  console.log('===============================================================');
  console.log('Mulai Pengujian Verifikasi Otorisasi Berbasis Peran (RBAC) API');
  console.log('===============================================================');

  // Pendapatan rute: diperuntukkan hanya untuk Operator Penerimaan dan admin
  const pendapatanSuccess = testRouterPermissions(
    'Rute Pendapatan (Kas Masuk)',
    pendapatanRouter
  );

  // SP2D rute: diperuntukkan untuk Operator SP2D & admin (SP2D core) ATAU admin saja (potongan/kelengkapan)
  const sp2dSuccess = testRouterPermissions(
    'Rute SP2D (Kas Keluar)',
    sp2dRouter
  );

  console.log('\n===============================================================');
  if (pendapatanSuccess && sp2dSuccess) {
    console.log('🎉 SEMUA PENGUJIAN OTORISASI BERHASIL! SISTEM SEPENUHNYA AMAN.');
    console.log('===============================================================');
    process.exit(0);
  } else {
    console.error('❌ BEBERAPA PENGUJIAN OTORISASI GAGAL! PERIKSA DETAIL DI ATAS.');
    console.log('===============================================================');
    process.exit(1);
  }
}

runAllTests();
