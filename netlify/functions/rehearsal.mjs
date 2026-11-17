import { getDatabase } from '@netlify/database';
import { adminKeyDigest } from '../rehearsal/admin-verifier.mjs';
import { createRehearsalHandler } from '../rehearsal/api.mjs';
import { createPostgresStore } from '../rehearsal/postgres.mjs';

let pool;
const store = createPostgresStore(() => {
  if (!pool) {
    pool = getDatabase().pool;
    pool.on('error', (error) => console.error('Rehearsal idle database connection failure', error?.code ?? error?.name));
  }
  return pool;
});
const handler = createRehearsalHandler({
  store,
  getAdminKey: () => Netlify.env.get('REHEARSAL_ADMIN_KEY'),
  adminKeyDigest,
});

export const config = { path: '/rehearsal/api' };

export default async function rehearsal(request, context) {
  const deploy = context.deploy;
  if (deploy?.context !== 'dev' && !(deploy?.context === 'production' && deploy.published)) {
    return Response.json({ error: 'not_found', message: '请在正式网址打开抽号页面。' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }
  return handler(request);
}
