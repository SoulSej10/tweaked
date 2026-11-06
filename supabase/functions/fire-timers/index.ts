// Sends the "timer done" push to a person's phones. Called every 10 seconds by pg_cron (see the cook_timer_push
// migration), only when a timer is about to ring. Not callable by the public: it needs the cron secret.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  const { data: cfg } = await db.from('push_config').select('key, value')
  const conf = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value as string]))
  if (!conf.cron_secret || req.headers.get('x-cron-secret') !== conf.cron_secret) return new Response('no', { status: 401 })
  webpush.setVapidDetails('mailto:noreply@tweaked.vercel.app', conf.vapid_public, conf.vapid_private)

  // Claim every timer ringing in the next few seconds, so two runs never send the same one twice.
  const { data: due, error } = await db
    .from('cook_timers')
    .update({ sent_at: new Date().toISOString() })
    .is('sent_at', null)
    .lte('fire_at', new Date(Date.now() + 12_000).toISOString())
    .select('id, user_id, recipe_id, label, fire_at')
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  await Promise.all(
    (due ?? []).map(async (t) => {
      // Wait for the exact moment, then ring.
      const wait = new Date(t.fire_at).getTime() - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', t.user_id)
      const payload = JSON.stringify({
        title: 'Timer done',
        body: `${t.label}: time to check your dish.`,
        url: t.recipe_id ? `/recipe/${t.recipe_id}/cook` : '/',
        tag: `timer-${t.id}`,
      })
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: 'high' })
          sent++
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }),
  )
  // Old rows are not needed once they have rung.
  await db.from('cook_timers').delete().lt('fire_at', new Date(Date.now() - 3600_000).toISOString())
  return Response.json({ due: due?.length ?? 0, sent })
})
