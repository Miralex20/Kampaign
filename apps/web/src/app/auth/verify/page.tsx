export default function VerifyPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Check your email — Campaign Messaging</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc; color: #0f172a;
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
            padding: 24px;
          }
          .card {
            background: #ffffff; border: 1px solid #e2e8f0;
            border-radius: 12px; padding: 2rem; max-width: 400px; text-align: center;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          }
          h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.75rem; color: #0f172a; }
          p { color: #64748b; line-height: 1.6; font-size: 0.95rem; }
          .icon { font-size: 2.5rem; margin-bottom: 1rem; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">✉️</div>
          <h1>Check your email</h1>
          <p>We sent a magic link to your inbox. Click it to sign in — it expires in 10 minutes.</p>
        </div>
      </body>
    </html>
  );
}
