import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useTitle } from '../lib/hooks'
import { BackLink } from '../components/Brand'

const UPDATED = '5 November 2026'
const CONTACT = 'https://github.com/SoulSej10/tweaked/issues'

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const { session } = useAuth()
  useTitle(kind === 'terms' ? 'Terms of Use' : 'Privacy Policy')
  return (
    <main className="page legal">
      <header className="topbar">
        <BackLink to={session ? '/settings' : '/'} />
        <h1>{kind === 'terms' ? 'Terms of Use' : 'Privacy Policy'}</h1>
      </header>
      <article className="pad">
        <p className="muted small">Last updated {UPDATED}</p>
        {kind === 'terms' ? <Terms /> : <Privacy />}
        <p className="muted small">Questions or problems? <a href={CONTACT} target="_blank" rel="noreferrer">Tell us here</a>.</p>
        <p className="small">
          {kind === 'terms' ? <Link to="/privacy">Read the Privacy Policy</Link> : <Link to="/terms">Read the Terms of Use</Link>}
        </p>
      </article>
    </main>
  )
}

function Terms() {
  return (
    <>
      <h2>What Tweaked is</h2>
      <p>Tweaked is a personal recipe notebook. You save dishes, cook them, and note what you changed. We also suggest dishes from free public collections and can read recipe pages you choose.</p>

      <h2>Your account</h2>
      <p>You need an account to use Tweaked. Keep your password private and tell us if you think someone else got in. You must be at least 13 years old. Please give a real email address so you can recover your account.</p>

      <h2>Your recipes are yours</h2>
      <p>Recipes, notes and photos you add stay yours and are private to your account. You give us permission only to store them and show them back to you. You can download everything or delete your account any time from the Me tab.</p>

      <h2>Recipes from other places</h2>
      <p>Suggestions come from TheMealDB, DummyJSON, TheCocktailDB and Wikibooks Cookbook (which is shared under CC BY-SA). When you import a recipe from a website, the recipe belongs to that website. We keep the link so you can credit and revisit it, and the copy is for your own private use. Do not use Tweaked to republish other people's work.</p>

      <h2>Allergies and food safety</h2>
      <p>The “skip” choices (such as nuts or dairy) hide dishes by matching words in the ingredient list. They can miss things, and recipe lists can be incomplete. <b>Never rely on Tweaked for an allergy or medical diet.</b> Check every ingredient yourself. Cook meat and eggs thoroughly and follow safe food handling.</p>

      <h2>AI features</h2>
      <p>If you use web search or ask Tweaked to read a page that has no recipe data, the search words or the page text are sent to an AI service to find or read recipes. AI can make mistakes: check amounts and steps before you cook. There is a daily limit on these lookups.</p>

      <h2>Fair use</h2>
      <p>Please do not misuse Tweaked: no attempts to break it, overload it, reach other people's data, or fetch addresses that are not public websites. We may limit or close accounts that do.</p>

      <h2>No guarantees</h2>
      <p>Tweaked is provided as it is, free of charge, without promises that it will always be available or error-free. Keep a copy of recipes that matter to you (the Me tab can export them). To the extent the law allows, we are not liable for losses from using it.</p>

      <h2>Changes and ending</h2>
      <p>We may update these terms and will change the date above. You can stop using Tweaked and delete your account at any time. We may end the service with reasonable notice.</p>
    </>
  )
}

function Privacy() {
  return (
    <>
      <h2>The short version</h2>
      <p>We keep what you put in Tweaked so it works across your devices. We do not sell your data, show ads, or run analytics or tracking.</p>

      <h2>What we store</h2>
      <ul>
        <li><b>Account:</b> your email, a name if you give one, and your password (stored only as a one-way scrambled value by our sign-in provider). If you use Google, we receive your Google name and email, not your Google password.</li>
        <li><b>Your cookbook:</b> recipes, versions, cook history, tweak notes, favorites, and photos you add. Photos are in a private folder that only you can open.</li>
        <li><b>Your taste:</b> the answers to the taste quiz, used to suggest dishes.</li>
        <li><b>Usage counts:</b> how many AI lookups you used today, to enforce the daily limit.</li>
        <li><b>On your device:</b> settings, your shopping list and saved copies of dishes are kept in your browser so the app is fast and works offline. They are not sent to us.</li>
      </ul>

      <h2>Who else is involved</h2>
      <ul>
        <li><b>Supabase</b> stores accounts and your cookbook. <b>Vercel</b> hosts the app.</li>
        <li><b>Recipe sources</b> (TheMealDB, DummyJSON, TheCocktailDB, Wikibooks) may be contacted by your browser to load dishes and photos, so they can see your internet address, as any website would.</li>
        <li><b>Websites you import:</b> our server fetches the single page you ask for. It sends no information about you to that site.</li>
        <li><b>AI service:</b> only when you use web search or AI page reading, the search words or the page text are sent to the AI provider. Your cookbook, name and email are not.</li>
        <li><b>Google:</b> only if you choose to sign in with Google.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li><b>See and download</b> everything from the Me tab (JSON or Markdown).</li>
        <li><b>Change</b> your name, email or password, or sign out of all devices, in Me.</li>
        <li><b>Delete</b> your account in Me. This permanently removes your account, recipes, history, photos and quiz answers. It cannot be undone.</li>
        <li>You can clear saved copies on your device with “Clear offline copies” in Me, or by clearing site data in your browser.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>Until you delete it. Deleting your account removes your data from our database straight away. Backups kept by our providers may take a short while to expire.</p>

      <h2>Security</h2>
      <p>Connections are encrypted. Each person can only read their own cookbook, enforced in the database itself. No system is perfectly secure, so please use a strong, unique password.</p>

      <h2>Children</h2>
      <p>Tweaked is not meant for children under 13, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we will update the date above and, for big changes, tell you in the app.</p>
    </>
  )
}
