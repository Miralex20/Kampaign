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
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 2rem;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          }
          h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.5rem; color: #0f172a; }
          p { color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem; line-height: 1.5; }
          label { display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.4rem; }
          input {
            width: 100%; padding: 0.65rem 0.85rem; border-radius: 6px;
            border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a;
            font-size: 0.95rem; margin-bottom: 1.2rem;
          }
          input:focus { outline: 2px solid #4f46e5; border-color: #4f46e5; }
          button {
            width: 100%; padding: 0.75rem; border-radius: 6px;
            background: #4f46e5; color: white; font-size: 0.95rem;
            border: none; cursor: pointer; font-weight: 600;
          }
          button:hover { background: #4338ca; }
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
