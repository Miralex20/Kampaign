/**
 * Magic-link sign-in page.
 * Users enter their email address and receive a login link.
 */
export default function SignInPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign In — Campaign Messaging</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f172a;
            color: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 2rem;
            width: 100%;
            max-width: 400px;
          }
          h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
          p { color: #94a3b8; margin-bottom: 1.5rem; font-size: 0.9rem; }
          label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.4rem; }
          input {
            width: 100%; padding: 0.75rem; border-radius: 6px;
            border: 1px solid #475569; background: #0f172a; color: #f8fafc;
            font-size: 1rem; margin-bottom: 1rem;
          }
          input:focus { outline: 2px solid #6366f1; border-color: #6366f1; }
          button {
            width: 100%; padding: 0.75rem; border-radius: 6px;
            background: #6366f1; color: white; font-size: 1rem;
            border: none; cursor: pointer; font-weight: 600;
          }
          button:hover { background: #4f46e5; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <h1>Sign in</h1>
          <p>Enter your email and we'll send you a magic link.</p>
          <form action="/api/auth/signin/nodemailer" method="POST">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              autoFocus
            />
            <input type="hidden" name="csrfToken" value="" />
            <button type="submit">Send magic link</button>
          </form>
        </div>
      </body>
    </html>
  );
}
