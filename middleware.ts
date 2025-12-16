import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// 1. تهيئة NextAuth
const { auth } = NextAuth(authConfig);

// 2. تصدير الدالة كـ default export وهو ما يبحث عنه Next.js
export default auth;

// 3. (اختياري لكن مهم جداً) تحديد المسارات التي يجب أن يعمل عليها الميدل وير
// هذا يمنع الميدل وير من العمل على الصور وملفات الـ static مما يحسن الأداء ويمنع أخطاء
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};